# High-Level Design — Dark Store: Catalog, Store Onboarding & Inventory

## 1. Scope

This HLD covers exactly the six steps in Flow 1: master catalog creation, store registration/onboarding, store-SKU assignment (with pricing), initial stock entry, the inventory ledger, and low-stock/drift alerting. Order placement, payments, rider dispatch, and the customer-facing app are separate HLDs — this module's only job is to be the source of truth for "what exists, where it's sold, and how much is in stock."

## 2. Architecture overview

Two front-ends, one backend service with three domain modules, one relational database as the system of record, and a cache + background worker for fast reads and async checks.

```
 Business Admin Web App         Store App (Manager / Employee)
        │  HTTPS/REST                    │  HTTPS/REST
        └───────────────┬─────────────────┘
                         ▼
                 API Gateway / BFF
                         │
     ┌───────────────────┼───────────────────┐
     ▼                    ▼                    ▼
 Catalog Module     Store Module        Inventory Module
     │                    │                    │
     └───────────────────┴───────────────────┘
                         │
                         ▼
              PostgreSQL (system of record)
                         │
                         ▼
              Redis (snapshot cache + job queue)
                         │
                         ▼
              Background Worker
        (threshold checks, reconciliation,
              notification dispatch)
```

Start as a modular monolith — one deployable service with three internally separated modules (catalog, store, inventory) sharing one database. The module boundaries map directly to the schema below, so splitting any one of them into its own microservice later (e.g. when the order/fulfillment system needs to scale independently) doesn't require a redesign — just moving its tables and routes out.

## 3. Tech stack


| Layer                       | Choice                                                                                                                 | Why                                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business admin frontend     | React + TypeScript + Tailwind + shadcn/ui                                                                              | Fast to build, consistent with most no-code/AI-generated front-ends if you're prototyping in Lovable first                                                                         |
| Store app (employee-facing) | React PWA, mobile-first                                                                                                | Stock entry happens on a phone/tablet on the floor; a PWA avoids app-store distribution for an internal tool. Move to React Native only if you need native barcode/camera scanning |
| Backend                     | Node.js(TypeScript)                                                                                                    | Modular monolith with enforced module boundaries (catalog/store/inventory), strong typing shared with the frontend, easy to peel into microservices later                          |
| Primary database            | PostgreSQL                                                                                                             | Strong relational integrity, native JSONB for flexible fields (geofence, operating hours), and transactional guarantees needed for the immutable ledger                            |
| Cache / fast reads          | Redis                                                                                                                  | Serves `available_qty` snapshot reads at low latency — this is what the order service will query at checkout time later                                                            |
| Background jobs             | BullMQ (Redis-backed)                                                                                                  | Threshold checks, ledger-vs-snapshot reconciliation, notification dispatch, store-verification reminders                                                                           |
| Object storage              | S3-compatible bucket                                                                                                   | Product images                                                                                                                                                                     |
| Auth                        | JWT + role-based access control (`business_admin`, `store_manager`, `store_employee`)                                  | Business sees everything; store roles are scoped to their own `store_id`                                                                                                           |
| Hosting                     | Docker containers — AWS ECS Fargate for production, or Railway/Render for MVP; RDS for Postgres, ElastiCache for Redis | Clear, boring path from MVP to scale                                                                                                                                               |
| Observability               | Pino structured logging + Sentry                                                                                       | Minimum viable visibility into the ledger/reconciliation logic, which is the part most likely to need debugging                                                                    |


If the team is more Python-native, FastAPI + SQLAlchemy is a fine drop-in replacement for the NestJS layer — the schema and module boundaries below don't change.

## 4. Database schema (PostgreSQL)

Before the table-by-table breakdown, the shape of the key relationships: `business_id` is the tenant key that threads through every table — it's how one Postgres database can safely hold multiple businesses' data. `store_id` and `sku_id` are the two foreign keys the entire inventory model hinges on, and the pair `(store_id, sku_id)` — not a generated mapping ID — is what `inventory_ledger` and `inventory_snapshot` actually key off, because every real query ("what's the stock of this SKU at this store") is asked in those terms, not by an internal mapping row ID.

### `businesses` — the tenant root

```sql
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- PK. Referenced as business_id by every other table.
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


| Column       | Type        | Key | Purpose                                                                                          |
| ------------ | ----------- | --- | ------------------------------------------------------------------------------------------------ |
| `id`         | UUID        | PK  | Unique tenant identifier; this is the `business_id` you'll see as a foreign key everywhere else. |
| `name`       | TEXT        | —   | Display name only.                                                                               |
| `created_at` | TIMESTAMPTZ | —   | Audit trail.                                                                                     |


### `stores` — dark store registry

```sql
CREATE TYPE store_status AS ENUM ('onboarding', 'active', 'inactive', 'closed');

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),         -- PK. Used as store_id by users, store_sku_mapping, ledger, snapshot, notifications.
  business_id UUID NOT NULL REFERENCES businesses(id),   -- FK → businesses.id. Scopes this store to one tenant.
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  geofence JSONB NOT NULL,                                -- Not a key. Read by the customer app to resolve "which store covers this delivery address."
  operating_hours JSONB NOT NULL,
  status store_status NOT NULL DEFAULT 'onboarding',      -- Gatekeeper value: SKU assignment (Step 3) and customer-facing visibility both require status = 'active'.
  manager_user_id UUID,                                    -- FK → users.id, added via ALTER TABLE below (see note).
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


| Column            | Type  | Key                  | Purpose                                                                                                                                              |
| ----------------- | ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | UUID  | PK                   | This becomes `store_id` everywhere downstream.                                                                                                       |
| `business_id`     | UUID  | FK → `businesses.id` | Tenant scoping — every store query should filter on this.                                                                                            |
| `geofence`        | JSONB | —                    | GeoJSON polygon defining the delivery radius; not used by this module directly, but it's the field Flow 3's address-to-store lookup reads.           |
| `status`          | ENUM  | —                    | Controls whether the store can receive SKU assignments or appear to customers.                                                                       |
| `manager_user_id` | UUID  | FK → `users.id`      | One designated manager account per store; added after `users` exists because of the circular reference (a store needs a user, a user needs a store). |


### `users` — business, manager, and employee accounts

```sql
CREATE TYPE user_role AS ENUM ('business_admin', 'store_manager', 'store_employee');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'disabled');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- PK. Reused as employee_id in inventory_ledger and as manager_user_id on stores.
  business_id UUID NOT NULL REFERENCES businesses(id),    -- FK → businesses.id. Tenant scoping, same pattern as stores.
  store_id UUID REFERENCES stores(id),                    -- FK → stores.id. NULL for business_admin (not tied to one store); set for store_manager/store_employee — this is the column that scopes their access to only their own store.
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,                             -- Unique key: used for login and to stop the same person being invited twice.
  role user_role NOT NULL,                                -- Read by the API layer's RBAC check on every request.
  status user_status NOT NULL DEFAULT 'invited',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stores
  ADD CONSTRAINT fk_stores_manager FOREIGN KEY (manager_user_id) REFERENCES users(id);
  -- Added after users exists, purely to resolve the circular dependency between stores and users.
```


| Column        | Type           | Key                  | Purpose                                                                                                                |
| ------------- | -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID           | PK                   | Becomes `employee_id` (ledger) or `manager_user_id` (stores) elsewhere.                                                |
| `business_id` | UUID           | FK → `businesses.id` | Tenant scoping.                                                                                                        |
| `store_id`    | UUID, nullable | FK → `stores.id`     | The actual access-control boundary for store-level roles.                                                              |
| `email`       | TEXT           | Unique               | Login identity; prevents duplicate invites.                                                                            |
| `role`        | ENUM           | —                    | Drives what the user is allowed to do — not a relational key, but functionally the most important column for security. |


### `master_catalog` — the business-level product list

```sql
CREATE TYPE catalog_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE master_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- PK. This is the sku_id referenced by store_sku_mapping, inventory_ledger (indirectly), and notifications.
  business_id UUID NOT NULL REFERENCES businesses(id),    -- FK → businesses.id. A SKU belongs to exactly one business's catalog.
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  barcode TEXT,                                           -- Used by the duplicate-SKU check in Step 1; enforced via the composite unique constraint below, not on its own.
  base_price NUMERIC(10,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  unit_of_measure TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]',
  status catalog_status NOT NULL DEFAULT 'draft',         -- Stays 'draft' until at least one store assignment exists.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, barcode)                            -- Composite unique key: a barcode can't repeat within one business's catalog, but the same physical barcode could exist in a different business's catalog without conflict.
);
```


| Column        | Type | Key                                               | Purpose                                                                      |
| ------------- | ---- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `id`          | UUID | PK                                                | This is `sku_id` everywhere else in the schema.                              |
| `business_id` | UUID | FK → `businesses.id`                              | Tenant scoping.                                                              |
| `barcode`     | TEXT | part of composite unique `(business_id, barcode)` | Duplicate-detection key — scoped per business, not globally.                 |
| `status`      | ENUM | —                                                 | `draft` vs `active` reflects whether the SKU has been assigned anywhere yet. |


### `store_sku_mapping` — the table that makes a SKU sellable somewhere

```sql
CREATE TABLE store_sku_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- PK, rarely queried directly — the meaningful identity of a row here is the (store_id, sku_id) pair below.
  store_id UUID NOT NULL REFERENCES stores(id),           -- FK → stores.id. One half of this table's real identity.
  sku_id UUID NOT NULL REFERENCES master_catalog(id),     -- FK → master_catalog.id. The other half.
  price_override NUMERIC(10,2),                           -- NULL = use master_catalog.base_price; non-null = this store's price wins.
  is_listed BOOLEAN NOT NULL DEFAULT false,                -- The actual on/off switch checked by customer-facing catalog queries.
  reorder_threshold INT NOT NULL DEFAULT 10,               -- Per-store, per-SKU threshold the background worker checks against available_qty.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, sku_id)                                -- Composite unique key — this is THE key. It enforces "one SKU maps to one store at most once," and it's the exact pair that inventory_ledger and inventory_snapshot reference as a foreign key below.
);
```


| Column               | Type       | Key                                   | Purpose                                                                                                                                              |
| -------------------- | ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | UUID       | PK                                    | Internal identity, not used by other tables.                                                                                                         |
| `store_id`, `sku_id` | UUID, UUID | composite Unique key + individual FKs | This pair is the real key of the table — it's what "is this SKU sold at this store" means, and what every downstream inventory table points back to. |
| `is_listed`          | BOOLEAN    | —                                     | Read by customer catalog queries; not a key, but functionally a gate.                                                                                |
| `reorder_threshold`  | INT        | —                                     | Compared against `inventory_snapshot.available_qty` to decide when to fire a `low_stock` notification.                                               |


### `inventory_ledger` — the append-only event log

```sql
CREATE TYPE ledger_entry_type AS ENUM ('stock_in', 'sale', 'damage', 'return', 'adjustment', 'correction');

CREATE TABLE inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- PK. Also stored as inventory_snapshot.last_ledger_id, so the snapshot can record "the last event it reflects."
  store_id UUID NOT NULL,                                 -- Not a standalone FK to stores — see the composite FK below. The real constraint is "this (store, sku) pair must already exist in store_sku_mapping."
  sku_id UUID NOT NULL,                                   -- Same reasoning.
  type ledger_entry_type NOT NULL,                        -- Determines what quantity means and is what the reconciliation job groups by.
  quantity INT NOT NULL,                                  -- Signed: positive for stock_in/return, negative for sale/damage. This is the only column that actually moves the stock count — everything else here is metadata/traceability.
  reference_id UUID,                                       -- Deliberately not a hard FK — it points to different tables depending on type (order_id for a sale, supplier_invoice_id for a stock_in). Used for traceability only.
  employee_id UUID REFERENCES users(id),                  -- FK → users.id. Who performed a manual action; NULL for system-generated entries (e.g. an automated sale deduction).
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),          -- Combined with the index below, this is what makes "current balance" and "history for a date range" queries fast.
  FOREIGN KEY (store_id, sku_id) REFERENCES store_sku_mapping (store_id, sku_id)
  -- Composite FK: this is the constraint that makes it impossible to log a stock movement for a SKU that was never actually assigned to that store.
);

CREATE INDEX idx_ledger_store_sku_time ON inventory_ledger (store_id, sku_id, created_at);
-- Not a key — an index that speeds up "all ledger entries for this store+SKU, ordered by time," the main query for both the reconciliation job and the stock-history UI.
```


| Column               | Type           | Key                                                   | Purpose                                                                                             |
| -------------------- | -------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                 | UUID           | PK                                                    | Referenced by `inventory_snapshot.last_ledger_id`.                                                  |
| `(store_id, sku_id)` | UUID, UUID     | composite FK → `store_sku_mapping (store_id, sku_id)` | Guarantees every ledger row corresponds to a real, existing store-SKU mapping.                      |
| `quantity`           | INT (signed)   | —                                                     | The actual stock movement; sum these per `(store_id, sku_id)` and you get the true current balance. |
| `employee_id`        | UUID, nullable | FK → `users.id`                                       | Accountability for manual entries.                                                                  |
| `reference_id`       | UUID, nullable | not a hard FK                                         | Traceability to whatever caused the movement (order, invoice, count correction).                    |


### `inventory_snapshot` — the fast-read cache, never the source of truth

```sql
CREATE TABLE inventory_snapshot (
  store_id UUID NOT NULL,                                 -- Part of the composite PK below.
  sku_id UUID NOT NULL,                                   -- Part of the composite PK below.
  available_qty INT NOT NULL DEFAULT 0,                    -- The cached answer to "how much stock right now." Always re-derivable as SUM(inventory_ledger.quantity) for the same pair — if the two ever disagree, the ledger wins.
  last_ledger_id UUID,                                      -- Points at the most recent ledger row this snapshot reflects, so the reconciliation job can tell if it's behind.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, sku_id),                           -- Composite PK, not a generated id — by definition there's exactly one snapshot row per (store, SKU) pair.
  FOREIGN KEY (store_id, sku_id) REFERENCES store_sku_mapping (store_id, sku_id)
);
```


| Column               | Type           | Key                                     | Purpose                                                                                                                               |
| -------------------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `(store_id, sku_id)` | UUID, UUID     | composite PK + FK → `store_sku_mapping` | Identity of the row IS the store-SKU pair; no separate id needed.                                                                     |
| `available_qty`      | INT            | —                                       | What checkout-time reservation checks (Flow 2) and the order service will actually read — this is the table's entire reason to exist. |
| `last_ledger_id`     | UUID, nullable | FK → `inventory_ledger.id` (soft)       | Lets the reconciliation job detect "has this snapshot caught up to the latest ledger entry."                                          |


### `notifications` — low-stock, drift, and verification alerts

```sql
CREATE TYPE notification_type AS ENUM
  ('low_stock', 'qty_mismatch', 'ledger_drift', 'store_verification_pending');
CREATE TYPE notification_status AS ENUM ('pending', 'acknowledged', 'resolved');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),    -- FK → businesses.id. Who sees this on their dashboard.
  store_id UUID REFERENCES stores(id),                    -- FK → stores.id, nullable — store-specific alerts (low_stock, store_verification_pending) set this; a future business-wide alert type wouldn't need to.
  sku_id UUID REFERENCES master_catalog(id),              -- FK → master_catalog.id, nullable — only set for SKU-specific alerts like low_stock.
  type notification_type NOT NULL,
  payload JSONB,                                           -- Type-specific detail, e.g. { "current_qty": 2, "threshold": 10 } for low_stock.
  status notification_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```


| Column               | Type                      | Key                                    | Purpose                                                                              |
| -------------------- | ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| `business_id`        | UUID                      | FK → `businesses.id`                   | Required on every row — whose dashboard this shows up on.                            |
| `store_id`, `sku_id` | UUID, UUID, both nullable | FK → `stores.id` / `master_catalog.id` | Optional context — not every notification type needs both.                           |
| `type`               | ENUM                      | —                                      | Drives how the frontend renders the alert and what `payload` is expected to contain. |


### Why these particular keys

Three design decisions are worth being able to explain to a reviewer: first, `(store_id, sku_id)` is used as a real foreign key target (via the unique constraint on `store_sku_mapping`) rather than just relying on `store_sku_mapping.id`, because every actual query in the system — checkout, stock entry, ledger lookup — is phrased in terms of "this store, this SKU," never in terms of an opaque mapping ID. Second, `inventory_ledger` has no `UPDATE`/`DELETE` path at the application layer by design — its only key-enforced guarantee is that every row maps to a valid `store_sku_mapping`, and the immutability itself is an application-level rule, not something Postgres enforces structurally (worth adding a `REVOKE UPDATE, DELETE` grant or a trigger if you want the database itself to refuse it). Third, `inventory_snapshot` deliberately has no independent `id` — its primary key is the same composite pair, because a snapshot only ever means one thing: "the current state of this store-SKU combination."

A few operational notes: `inventory_ledger` is append-only — the application layer should never issue an `UPDATE` or `DELETE` against it, only `INSERT`. `inventory_snapshot` is a cache, not a source of truth; it's updated inside the same transaction as each ledger insert (`available_qty = available_qty + delta`, an atomic update avoids race conditions between concurrent sales and stock-ins on the same row), and a scheduled job periodically recomputes it from `SUM(inventory_ledger.quantity)` to catch and correct drift.

## 5. API surface (representative)


| Module    | Method & path                         | Purpose                                                |
| --------- | ------------------------------------- | ------------------------------------------------------ |
| Catalog   | `POST /catalog/skus`                  | Create a SKU (Step 1)                                  |
| Catalog   | `GET /catalog/skus?status=unassigned` | List SKUs not yet mapped to any store                  |
| Store     | `POST /stores`                        | Register a new dark store (Step 2)                     |
| Store     | `POST /stores/:id/activate`           | Mark store active once manager verification completes  |
| Store     | `POST /stores/:id/sku-mappings`       | Assign a SKU to this store with price/listing (Step 3) |
| Inventory | `POST /stores/:id/inventory/stock-in` | Log opening stock or a restock (Step 4)                |
| Inventory | `GET /stores/:id/inventory/:sku_id`   | Current `available_qty` + ledger history               |
| Inventory | `GET /stores/:id/inventory/alerts`    | Pending low-stock / drift notifications                |


## 6. Step-to-implementation mapping


| Flow step              | Tables touched                           | Event emitted                                  |
| ---------------------- | ---------------------------------------- | ---------------------------------------------- |
| 1. Master catalog      | `master_catalog`                         | `sku.created`                                  |
| 2. Store registration  | `stores`, `users`                        | `store.onboarding_started` → `store.activated` |
| 3. Store assignment    | `store_sku_mapping`                      | `sku.assigned`                                 |
| 4. Initial stock entry | `inventory_ledger`, `inventory_snapshot` | `stock.updated`                                |
| 5. Inventory ledger    | `inventory_ledger`, `inventory_snapshot` | `stock.updated` (continuous)                   |
| 6.ZDW                  | `notifications`                          | `inventory.threshold_breached`                 |


For an MVP, these "events" can simply be calls made within the same transaction (no message broker needed yet). Move to a real event bus (SQS/SNS or Kafka) only once the order/fulfillment service becomes a separate deployable that needs to react to `stock.updated` and `inventory.threshold_breached` independently.

## 7. Cross-cutting concerns

Multi-tenancy is enforced by scoping every query to `business_id`, either via application-level guards or Postgres row-level security if multiple businesses ever share infrastructure. Role-based access keeps `store_manager`/`store_employee` accounts scoped to their own `store_id` — they should never be able to query another store's data. Idempotency keys on the stock-in endpoint prevent duplicate ledger rows if a request is retried after a timeout. The reconciliation job is the safety net for any drift between `inventory_snapshot` and the true ledger sum — it should run on a schedule (e.g. every 15 minutes) and write a `ledger_drift` notification rather than silently auto-correcting, so a human can confirm the cause.

## 8. Out of scope here

Order-time inventory reservation, payment, rider dispatch, and customer catalog browsing all read from `inventory_snapshot` and `store_sku_mapping` but are designed in separate HLDs — this module's contract to the rest of the system is just `available_qty` per `(store_id, sku_id)` and the `inventory.threshold_breached` event.