# API endpoints

Base URL: `http://localhost:4000/api`. JSON in and out. Authenticated calls send `Authorization: Bearer <token>`.
Errors look like `{ "error": "Readable message" }` with a matching HTTP status.

## Auth
| Method | Path | Auth | Body / query | Notes |
|---|---|---|---|---|
| GET | `/auth/config` | – | – | `{ googleClientId, demoMode, googleDemo }` |
| POST | `/auth/otp/send` | – | `{ channel: "phone"\|"email", identifier, portal: "passenger"\|"driver", purpose?: "login"\|"register"\|"reset" }` | Sends a 6-digit OTP. The driver portal requires a registered driver. `register` returns 409 if the account already has a password. `reset` answers the same for unknown accounts but sends nothing. Demo mode returns `devCode`. |
| POST | `/auth/password/register` | – | `{ channel, identifier, code, password, name, portal }` | Checks the sign-up code, creates the account (or adds a password to an OTP/Google account) and returns `{ token, user }`. Password: 8–128 characters with a letter and a number. |
| POST | `/auth/password/login` | – | `{ identifier (email or mobile), password, portal }` | Returns `{ token, user }`. 401 "Wrong email/mobile number or password" for any failure. 5 wrong tries → 429 locked for 15 min. Rate-limited per IP. |
| POST | `/auth/password/reset` | – | `{ channel, identifier, code, password, portal }` | Checks the reset code, sets the new password, unlocks the account and logs in. |
| POST | `/auth/otp/verify` | – | `{ channel, identifier, code, portal, name? }` | Returns `{ token, user }`. Creates a passenger on first login. |
| POST | `/auth/google` | – | `{ credential, portal }` | `credential` = Google ID token from Google Identity Services. |
| POST | `/auth/google/demo` | – | `{ email, portal }` | Local only, when no Google client ID is set. |
| GET | `/auth/me` | user | – | Current user. |
| PATCH | `/auth/me` | user | `{ name }` | Update name, returns a fresh token. |

## Search, seats, tracking (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/places` | All stops as `{ name, ta }` (English + Tamil) for autocomplete. |
| GET | `/search?from=Chennai&to=Madurai&date=YYYY-MM-DD` | `from`/`to` accept Tamil names, nicknames and small typos. Returns `buses` (direct: departure/arrival, duration, fare, seats left, `departed`) and `connections` when no direct bus is still to come: `[{ legs:[…], changes:[{at, waitMinutes}], totalFare, totalMinutes, tags:['fastest','cheapest','earliest','fewestChanges'] }]`. If a place isn't recognised, it returns `unknown: [{ field, input, suggestions }]`. |
| GET | `/departures?place=Madurai&date=YYYY-MM-DD` | Departure board: every bus leaving that place on that date, with `towards`, `via`, `departed`. |
| GET | `/pnr/:pnr` | Public PNR status (route, date, time, bus, seat count, status; no names or contacts). |
| GET | `/trips/:scheduleId/:date` | Trip info, stops with times and fares, seat map (`seat_no, deck, row_no, col_no, status`). |
| GET | `/track/:scheduleId/:date` | Stops, latest GPS location, trail (last 200 points), ETA per stop. |

## Bookings & payments (logged in)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/bookings` | `{ scheduleId, travelDate, fromStopId, toStopId, passengers:[{seatNo,name,age,gender}], contactEmail?, contactPhone? }` | Holds seats for 10 minutes and returns the booking (`status: pending_payment`). 409 if a seat was just taken. |
| GET | `/bookings` | – | My booking history. |
| GET | `/bookings/:id` | – | One booking. Includes `qr` (data-URL PNG) when confirmed. |
| GET | `/bookings/:id/refund-quote` | – | `{ refund: { pct, amount } \| null }` |
| POST | `/bookings/:id/cancel` | – | Confirmed: cancels with a refund. Pending: releases the hold. |
| POST | `/payments/mock` | `{ bookingId, method: "upi"\|"card"\|"netbanking", outcome: "success"\|"failure" }` | Success confirms the booking, books the seats and sends the e-ticket by email + SMS. Failure returns 402. |

## Driver / conductor (role driver or admin)
| Method | Path | Body / query | Notes |
|---|---|---|---|
| GET | `/driver/trips?date=` | – | Trips that day (only the assigned bus, if one is set). |
| POST | `/driver/gps` | `{ scheduleId, travelDate, lat, lng, speedKmh?, heading? }` | Stores the point and broadcasts `gps` with ETAs. Returns `offRouteKm`. |
| GET | `/driver/trips/:scheduleId/:date/passengers` | – | Confirmed passengers by seat, with boarded flag. |
| POST | `/driver/board` | `{ scheduleId, travelDate, qr? \| pnr? \| seatNo?, boarded? }` | Verifies the signed QR or PNR for this trip and marks seats boarded / unboarded. |

## Admin (role admin)
| Method | Path | Body |
|---|---|---|
| GET / POST | `/admin/routes` | POST `{ code, name, avgSpeedKmh?, stops:[{name,lat,lng}] }` (distance and time computed) |
| PATCH / DELETE | `/admin/routes/:id` | PATCH `{ active }` |
| GET / POST | `/admin/buses` | POST `{ regNo, busType, layout, totalSeats, depot? }` |
| PATCH / DELETE | `/admin/buses/:id` | PATCH `{ active }` |
| GET / POST | `/admin/schedules` | POST `{ routeId, busId, departureTime:"HH:MM", days:"0123456", serviceNo? }` |
| PATCH / DELETE | `/admin/schedules/:id` | PATCH `{ active }` |
| GET / POST | `/admin/fares` | POST `{ routeId, busType, amount }` (upsert) |
| DELETE | `/admin/fares/:id` | – |
| GET / POST | `/admin/drivers` | POST `{ name, email?, phone?, assignedBusId? }` |
| DELETE | `/admin/drivers/:id` | Removes driver access. |
| GET | `/admin/stats` | Counts and revenue. |

## Real-time (Socket.io, path `/socket.io`)
| Direction | Event | Payload |
|---|---|---|
| client → server | `join` / `leave` | `"trip:<scheduleId>:<YYYY-MM-DD>"` |
| server → room | `seats` | `{ scheduleId, date, seats:[…] }` when seats are held, booked, released or cancelled |
| server → room | `gps` | `{ location:{lat,lng,speed_kmh,heading,recorded_at}, etas:[{stopId,passed,etaMinutes,eta,remainingKm}] }` |

## Dev only
| GET | `/dev/outbox` | Last 50 emails/SMS that would have been sent (when SMTP/Twilio are not configured). |
|---|---|---|
