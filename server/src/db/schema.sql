-- GovBus database schema (PostgreSQL / Supabase)
-- Run this once in the Supabase SQL editor (or it runs automatically in demo mode).
-- The backend connects with the Postgres connection string, so RLS is enabled with
-- NO policies: the public anon/PostgREST API can't read or write these tables.

-- ---------- Users (passengers, drivers/conductors, admins) ----------
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text,
  email           text UNIQUE,
  phone           text UNIQUE,
  role            text NOT NULL DEFAULT 'passenger' CHECK (role IN ('passenger','driver','admin')),
  google_sub      text UNIQUE,
  assigned_bus_id uuid,                       -- drivers only (optional)
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
-- Password login (scrypt hash; NULL for OTP/Google-only accounts) and brute-force lockout.
-- ALTERs keep older databases in step when this file is re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- ---------- One-time passwords ----------
CREATE TABLE IF NOT EXISTS otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text NOT NULL,                  -- normalised email or phone
  code_hash   text NOT NULL,                  -- HMAC-SHA256, never the raw code
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_identifier_idx ON otp_codes (identifier, created_at DESC);

-- ---------- Routes and stops ----------
CREATE TABLE IF NOT EXISTS routes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,            -- e.g. "101"
  name       text NOT NULL,                   -- e.g. "Chennai - Madurai"
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stops (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id           uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq                int  NOT NULL,           -- order along the route, starting at 1
  name               text NOT NULL,
  lat                double precision NOT NULL,
  lng                double precision NOT NULL,
  distance_km        double precision NOT NULL DEFAULT 0,  -- from route origin
  minutes_from_start int NOT NULL DEFAULT 0,               -- scheduled offset from origin
  UNIQUE (route_id, seq)
);
CREATE INDEX IF NOT EXISTS stops_name_idx ON stops (lower(name));

-- ---------- Buses ----------
CREATE TABLE IF NOT EXISTS buses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no      text NOT NULL UNIQUE,           -- e.g. "TN 01 N 1234"
  bus_type    text NOT NULL CHECK (bus_type IN ('ordinary','express','ac','sleeper')),
  layout      text NOT NULL DEFAULT '2x2' CHECK (layout IN ('2x2','2x3','1x2')),
  total_seats int  NOT NULL CHECK (total_seats BETWEEN 1 AND 80),
  depot       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Fares (full-route fare per bus type; prorated by distance) ----------
CREATE TABLE IF NOT EXISTS fares (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id  uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  bus_type  text NOT NULL CHECK (bus_type IN ('ordinary','express','ac','sleeper')),
  amount    int  NOT NULL CHECK (amount > 0), -- rupees, origin to final stop
  UNIQUE (route_id, bus_type)
);

-- ---------- Schedules (a bus running a route at a time on given weekdays) ----------
CREATE TABLE IF NOT EXISTS schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_no     text,                        -- e.g. "101A"
  route_id       uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  bus_id         uuid NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  departure_time time NOT NULL,               -- local time at origin
  days           text NOT NULL DEFAULT '0123456', -- 0=Sun ... 6=Sat
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Bookings ----------
CREATE TABLE IF NOT EXISTS bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pnr                 text NOT NULL UNIQUE,
  user_id             uuid NOT NULL REFERENCES users(id),
  schedule_id         uuid NOT NULL REFERENCES schedules(id),
  travel_date         date NOT NULL,          -- date the bus leaves its origin
  from_stop_id        uuid NOT NULL REFERENCES stops(id),
  to_stop_id          uuid NOT NULL REFERENCES stops(id),
  seat_nos            text[] NOT NULL,
  passengers          jsonb NOT NULL,         -- [{seatNo,name,age,gender}]
  contact_email       text,
  contact_phone       text,
  fare_per_seat       int NOT NULL,
  total_amount        int NOT NULL,
  status              text NOT NULL DEFAULT 'pending_payment'
                      CHECK (status IN ('pending_payment','confirmed','cancelled','expired')),
  hold_expires_at     timestamptz,
  refund_amount       int NOT NULL DEFAULT 0,
  refund_status       text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','processing','processed')),
  refund_initiated_at timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);

-- ---------- Seats (inventory per trip = schedule + travel date) ----------
CREATE TABLE IF NOT EXISTS seats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  travel_date date NOT NULL,
  seat_no     text NOT NULL,
  deck        text,                           -- 'L' / 'U' for sleepers
  row_no      int NOT NULL,
  col_no      int NOT NULL,                   -- grid column; the aisle is a gap
  status      text NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked')),
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  held_until  timestamptz,
  boarded     boolean NOT NULL DEFAULT false,
  UNIQUE (schedule_id, travel_date, seat_no)
);

-- ---------- Payments (mock gateway) ----------
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id),
  amount         int NOT NULL,
  method         text NOT NULL,               -- upi / card / netbanking
  status         text NOT NULL CHECK (status IN ('success','failed')),
  gateway_txn_id text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Live GPS ----------
CREATE TABLE IF NOT EXISTS gps_locations (
  id          bigserial PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  travel_date date NOT NULL,
  driver_id   uuid REFERENCES users(id),
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  speed_kmh   double precision,
  heading     double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gps_trip_idx ON gps_locations (schedule_id, travel_date, recorded_at DESC);

-- Foreign-key lookups used by search, booking and the driver screen.
CREATE INDEX IF NOT EXISTS schedules_route_idx ON schedules (route_id);
CREATE INDEX IF NOT EXISTS schedules_bus_idx ON schedules (bus_id);
CREATE INDEX IF NOT EXISTS bookings_trip_idx ON bookings (schedule_id, travel_date);
CREATE INDEX IF NOT EXISTS bookings_from_stop_idx ON bookings (from_stop_id);
CREATE INDEX IF NOT EXISTS bookings_to_stop_idx ON bookings (to_stop_id);
CREATE INDEX IF NOT EXISTS seats_booking_idx ON seats (booking_id);
CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id);
CREATE INDEX IF NOT EXISTS gps_driver_idx ON gps_locations (driver_id);

-- Lock the tables away from Supabase's public REST API (backend uses a direct connection).
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fares          ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_locations  ENABLE ROW LEVEL SECURITY;
