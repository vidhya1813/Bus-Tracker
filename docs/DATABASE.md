# Database schema

PostgreSQL (Supabase). DDL: [server/src/db/schema.sql](../server/src/db/schema.sql).

```mermaid
erDiagram
  users ||--o{ bookings : makes
  users ||--o{ payments : pays
  users ||--o{ gps_locations : "shares (driver)"
  buses ||--o{ users : "assigned to (driver)"
  routes ||--o{ stops : has
  routes ||--o{ fares : priced_by
  routes ||--o{ schedules : runs
  buses ||--o{ schedules : operates
  schedules ||--o{ seats : "inventory per date"
  schedules ||--o{ bookings : for
  schedules ||--o{ gps_locations : tracked_by
  bookings ||--o{ seats : holds
  bookings ||--o{ payments : paid_by
  stops ||--o{ bookings : "from / to"

  users {
    uuid id PK
    text name
    text email UK
    text phone UK
    text role
    text google_sub UK
    uuid assigned_bus_id FK
    text password_hash
    int failed_logins
    timestamptz locked_until
    timestamptz last_login_at
  }
  otp_codes {
    uuid id PK
    text identifier
    text code_hash
    timestamptz expires_at
    int attempts
    bool used
  }
  routes {
    uuid id PK
    text code UK
    text name
    bool active
  }
  stops {
    uuid id PK
    uuid route_id FK
    int seq
    text name
    float lat
    float lng
    float distance_km
    int minutes_from_start
  }
  buses {
    uuid id PK
    text reg_no UK
    text bus_type
    text layout
    int total_seats
    text depot
    bool active
  }
  fares {
    uuid id PK
    uuid route_id FK
    text bus_type
    int amount
  }
  schedules {
    uuid id PK
    text service_no
    uuid route_id FK
    uuid bus_id FK
    time departure_time
    text days
    bool active
  }
  bookings {
    uuid id PK
    text pnr UK
    uuid user_id FK
    uuid schedule_id FK
    date travel_date
    uuid from_stop_id FK
    uuid to_stop_id FK
    text_array seat_nos
    jsonb passengers
    int total_amount
    text status
    text refund_status
  }
  seats {
    uuid id PK
    uuid schedule_id FK
    date travel_date
    text seat_no
    text deck
    int row_no
    int col_no
    text status
    uuid booking_id FK
    timestamptz held_until
    bool boarded
  }
  payments {
    uuid id PK
    uuid booking_id FK
    uuid user_id FK
    int amount
    text method
    text status
    text gateway_txn_id
  }
  gps_locations {
    bigint id PK
    uuid schedule_id FK
    date travel_date
    uuid driver_id FK
    float lat
    float lng
    float speed_kmh
    float heading
    timestamptz recorded_at
  }
```

## Table notes

| Table | Purpose | Key rules |
|---|---|---|
| `users` | Passengers, drivers/conductors, admins | `role` ∈ passenger / driver / admin. Needs an email or a phone. Drivers are created by admins; `assigned_bus_id` limits which bus they can operate. |
| `otp_codes` | Login codes | Only an HMAC-SHA256 of the code is stored. Valid 5 minutes, max 5 wrong attempts. |
| `routes` | A corridor, e.g. "101 Chennai - Madurai" | Reverse direction is a separate route. |
| `stops` | Ordered stops on a route | `distance_km` and `minutes_from_start` are cumulative from the origin and drive fare, timing and ETA. |
| `buses` | Fleet | `bus_type` ∈ ordinary / express / ac / sleeper; `layout` 2x2, 2x3 or 1x2 (sleeper, two decks). |
| `fares` | Full-route fare per bus type | A partial journey pays in proportion to distance (minimum ₹10). |
| `schedules` | A bus running a route at a time | `days` is the list of weekdays, `0123456` = daily (0 = Sunday). Ordinary buses take ×1.15 longer. |
| `seats` | Seat inventory per trip (schedule + travel date) | Created the first time a trip is opened. `status` ∈ available / held / booked; holds expire after 10 minutes. |
| `bookings` | A ticket (one PNR, up to 6 seats) | `status`: pending_payment → confirmed → cancelled, or → expired. Refund: processing → processed. |
| `payments` | Mock gateway transactions | One row per attempt (success / failed). |
| `gps_locations` | Live positions from the driver's phone | Indexed by trip and time; the latest row is the bus's current position. |
