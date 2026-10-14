# LIBRAX

**Library operations and book discovery that runs entirely in your browser.**

LIBRAX is a frontend-only library management system built with React, TypeScript and Vite. It has no backend, no database server and no API keys. Data is stored in your browser's local storage behind a repository layer, so it can move to a real backend later without rewriting screens.

---

## Features

**Staff (Administrator and Librarian)**
- Dashboard with live metrics, all computed from stored records:
  - titles, copies, available, on loan, active members, overdue, open reservations, outstanding fines
  - circulation trend, most borrowed titles, popular categories, inventory status, overdue alerts, reservation activity, recent activity
  - every metric links to the matching filtered screen
- **Circulation desk:** issue, return and renew. Every rule is checked and shown before anything changes:
  - membership status, borrowing limit, overdue items, fine threshold
  - copy status, reservation queue, duplicate title
- **Catalog:** add, edit and archive titles; search, filter, sort, paginate; bulk archive with confirmation; CSV export. ISBN checksums are validated and duplicates detected.
- **Inventory:** every physical copy is tracked separately from its title, with barcode, shelf, condition, acquisition date and status. Only permitted status changes are allowed, and a copy freed by a status change is offered to the reservation queue.
- **Members:** register, edit, search, and filter by type and status. Deactivating or suspending a member keeps all their history.
- **Loans, reservations and fines:**
  - Fines support desk payments, adjustments with reasons, waivers, manual charges and a full audit trail.
  - Fines are integer minor units only, never floating point.
- **Reports:** with date ranges and a CSV export per section.
- **Admin only:**
  - library settings
  - activity log
  - categories and authors
  - CSV import with preview
  - full JSON backup and restore
  - reset demo data

**Students only: Self-checkout**
- Students borrow books themselves. They scan the ISBN on the back cover, or the LIBRAX label inside, with the camera, or type it.
- LIBRAX shows the due date and every borrowing rule (overdue items, limit, fines, holds) before the student confirms.
- A copy already reserved for that student is used first.
- The loan is logged as a self-checkout. Returns still go to the desk.

**Faculty only: Course reserves**
- Faculty create course reading lists (e.g. *CS301 Distributed Systems*) and add titles by searching or by scanning several books in a row.
- Titles on an active course become **course reserves**. Students borrow them for a short period (default 3 days, set in Settings) with no renewals, so the whole class gets a turn.
- Faculty and staff keep their normal loan terms.
- Reserved titles show a "Required for CS301" badge, and Discover has a "Course reserves only" filter.
- Each course shows how many copies are out and how many students are waiting.
- Archiving a course returns its titles to normal loans. Existing due dates never change.

**Students and Faculty**
- Personal home page, discovery with combinable filters and search, and book detail pages with related titles.
- Place holds or reservations and see your queue position.
- My books, with renewals.
- Saved books, fines and notifications.
- Profile showing your borrowing privileges. Faculty get longer loans, higher limits and more renewals.

**Barcode scanning**
- Scan with the laptop or phone camera, a USB barcode scanner, or by typing, everywhere it matters:
  - **Circulation desk (issue):** scan the ISBN on the back cover or a LIBRAX copy label. The right copy is picked automatically, and a copy held for the selected member is chosen first.
  - **Return and renew:** scan the returned book to find its loan instantly. If several copies of that title are out, they are listed to choose from.
  - **Catalog → Scan a book:** a known book opens its page; an unknown ISBN opens “Add title” with the ISBN filled in.
  - **Book form:** a scan button on the ISBN field fills it and flags duplicates.
  - **Inventory:** scanning a copy label jumps to that copy; scanning an ISBN lists all its copies.
  - **Discover (students and faculty):** scan any book, even one in a shop, to check whether the library has it.
- Accepts ISBN-10 and ISBN-13 interchangeably.
- **Print labels** on a title’s page prints Code 128 barcode labels for its copies. Barcodes are generated in the browser with no extra library.
- Uses the browser’s native `BarcodeDetector` (Chrome, Edge, Android). On Safari and Firefox it falls back to ZXing, which loads only when needed.

**Library-card sign-in**
- The Student and Faculty portals ask the reader to scan their library card, whose barcode holds the member number (e.g. `STU-0001`).
- Wrong cards are refused with a reason:
  - a faculty card at the Student portal
  - a book barcode
  - an unknown card
  - a suspended membership
- Demo cards can be printed from the sign-in page, and staff can print any member's card from the member page.

**Throughout**
- Dark theme first, with a light theme and system option.
- Collapsible sidebar and mobile navigation.
- ⌘K / Ctrl-K global search.
- Notification center with unread counts.
- Breadcrumbs, toasts and accessible dialogs with focus trapping.
- Keyboard-navigable comboboxes and tables that become stacked cards on mobile.
- Reduced-motion support.

## Technology

React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3 · React Router 6 · Framer Motion · Lucide React · Recharts · React Hook Form · Zod · date-fns · ZXing (scanner fallback) · Vitest + Testing Library

## Run it on your computer

Works on Windows, macOS and Linux. You need two free tools:

- **Node.js 18.18 or newer** (the LTS version from [nodejs.org](https://nodejs.org)). Check with `node -v`. An `.nvmrc` is included if you use nvm.
- **Git** ([git-scm.com](https://git-scm.com)), or use GitHub's **Code → Download ZIP** instead of cloning.

```bash
git clone <this repository's URL>
cd librax
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173) in **Chrome** or **Edge**. Keep the terminal open while you use the app; press Ctrl+C to stop it.

No database, server, account or API key is needed. Demo data (books, members, loans, reservations and fines) loads automatically on first run and is saved in your browser.

Other commands:

```bash
npm test             # run all 131 automated tests once
npm run typecheck    # strict TypeScript check
npm run build        # type-check and create a production build in dist/
npm run preview      # serve the production build locally
```

**Troubleshooting**

- `npm: command not found` → Node.js is not installed, or the terminal was opened before installing it. Install Node.js and open a new terminal.
- Port 5173 already in use → Vite picks the next free port (5174, …); use the address it prints.
- Camera not starting → allow camera access for the site, and use `localhost` or an `https://` address (browsers block cameras on plain `http://` network addresses).

## AI Librarian (students and faculty)

A chat page (**AI Librarian** in the menu) that answers in plain language and can act for the reader:

- **Finds books** by topic, author or title, and says whether a copy is on the shelf and where.
- **Explains the reader's account**: what's due, overdue, held for pickup, queue positions, fines, and the borrowing rules.
- **Acts after confirmation**: reserve a title, renew loans, and (faculty only) add a book to a course reserve. Nothing changes until the reader presses **Confirm**, and every action goes through the same rule checks as the rest of LIBRAX.
- **Shows its sources**: "Checked in LIBRAX" lists the exact records each answer used.

How it works:

- LIBRAX's own engine (`src/services/librarian.ts`) understands the question, looks everything up and proposes the actions. It works in every browser, instantly.
- In desktop Chrome with on-device AI (the Prompt API, Gemini Nano), the model also reads open-ended questions ("something about why markets panic") and words the reply. It runs on the laptop with no server and no API key; questions never leave the device.
- The model only receives LIBRAX's facts and is told not to invent anything. Books, dates, amounts and actions always come from the database.
- On-device AI needs Chrome 148 or newer on Windows, macOS 13+ or Linux, about 22 GB of free disk, and 16 GB of RAM or a GPU with more than 4 GB. Chrome downloads the model once (several GB). Elsewhere the page says it is using the instant engine.

## Library cards and card series

Readers sign in by scanning their college ID card: a barcode or a QR code.

- **Admin → Settings → Library card series** sets the number ranges that may sign in, e.g. `AU1000 – AU2500` for students (the college ID-card barcodes, like `AU1296`). Ranges are checked for typos and overlaps.
- **First scan of a card in a series** opens "Activate your library card". LIBRAX reads what it can from the number; a VTU-style USN gives the joining year and branch. The reader confirms their name (email optional) and is signed straight in. After that, every scan signs them in directly.
- **QR codes** carrying text such as `Name: Riya Sharma | USN: 1JB22CS045` are understood, and the name is prefilled.
- Cards outside every series, cards scanned at the wrong portal, and switched-off series are refused with a clear reason.
- Members registered by staff (e.g. `STU-0001`) keep signing in with their existing numbers.
- The printer button on a series prints 12 unused cards, for new readers or for demos.

Student cards AU1000–AU2500 are set up by default. The faculty series (SJBF001–SJBF150) is an example; replace it with the real faculty range.

## Using the camera scanner

- The browser only allows camera access on **https://** or **localhost**. `npm run dev` on your laptop works directly at `http://localhost:5173`, using the laptop camera.
- To scan with a **phone**, the phone must open LIBRAX over HTTPS, for example through an HTTPS tunnel to your dev server. A plain `http://192.168.x.x` address will block the camera; LIBRAX detects this and offers typing instead.
- Hold the book 10–20 cm from the camera with the barcode inside the frame. A successful scan flashes green and vibrates on phones.
- USB barcode scanners work everywhere with no setup. They type the code and press Enter.

## Demo sign-in

No passwords exist or are stored.

| Role          | How to sign in                                              | Lands on               |
|---------------|-------------------------------------------------------------|------------------------|
| Administrator | Choose **Administrator** (demo identity Avery Lin)          | `/admin/dashboard`     |
| Librarian     | Choose **Librarian** (demo identity Lee Okafor)             | `/librarian/dashboard` |
| Student       | Choose **Student**, then **Scan your library card**         | `/student/home`        |
| Faculty       | Choose **Faculty**, then scan a card or pick a demo account | `/faculty/home`        |

Students sign in **only by scanning** an ID card with the camera or a handheld barcode scanner; typing a number is switched off. To try it without a real college card, click **Print demo student cards** on the sign-in screen and hold a printed card (or the card shown on a phone screen) up to the webcam. Student card **STU-0001** is Riya Sharma, whose account shows the interesting cases: an overdue loan, a loan due soon, a hold ready for pickup, a queue position and fines. A card number in the student card series (by default **AU1000–AU2500**) that has never been used opens a one-time activation instead.

> **Security notice:** the sign-in screen and route guards only shape the interface. Everything runs in, and is stored by, the browser, so a user can read or change any data. Do not use this sign-in as production authentication.

## How data is stored

- All library data is one versioned JSON document in `localStorage` under the key `librax:db`.
- It is validated with Zod on load, migrated through `MIGRATIONS` in `src/repositories/schema.ts`, and checked for referential integrity.
- Every change is an atomic transaction (`LibraryStore.transact`):
  - It runs on a copy.
  - Integrity is checked.
  - The copy is written to storage, and only then swapped in.
  - If any step fails, nothing changes. Multi-record operations such as return → fine → hold hand-off can never leave contradictory records.
- If stored data is unreadable, LIBRAX shows a recovery screen. It keeps the raw data (`librax:db:corrupt-backup`) and lets you download it, restore a backup or start over. It never silently overwrites.
- If storage is unavailable (blocked site data, or quota full), a banner says changes are not being saved.
- Data is local to this browser and device. Clearing site data or using a private window loses it, so use **Import & export → Download backup** regularly.
- Screens call `src/app/library.ts`, which calls pure services in `src/services/`. A server-backed adapter can replace `LocalStorageAdapter` (`src/repositories/adapter.ts`) without touching screens.

## Resetting demo data

Sign in as Administrator, then go to **Import & export → Reset demo data**. Alternatively, clear this site's data in your browser. The demo library is generated deterministically: 34 titles, 18 members, about six months of loan history, active, overdue and returned loans, reservations and fines. It is built relative to today's date, so overdue and due-soon cases always exist. It is never duplicated on startup.

## Import and export

- **Books CSV**
  - Required columns: `isbn, title, authors, publisher, publication_year, category, language, page_count`.
  - Optional: `subtitle, description, edition, tags, cover_url, copies, shelf`. `copies` + `shelf` create physical copies.
  - Separate multiple authors with `;`.
- **Members CSV**
  - Required: `name, email, type (student|faculty|staff), department`.
  - Optional: `phone, borrow_limit`.
- Download a ready-made template for either from **Import & export**.
- Every import is parsed as text, validated row by row and previewed (valid / invalid with reasons / duplicates skipped) before anything is saved. Nothing is partially overwritten.
- Exports are available for books, members, inventory, loans, reservations and fines, plus report sections. Cells that look like spreadsheet formulas are neutralised.
- **Backup / restore** is the complete JSON document. A restore is checked against schema version, structure and referential integrity before it replaces anything, and is never executed as code.

## Business rules (summary)

- **Loans:** students and staff 14 days, faculty 30 days. Limits are 4 / 6 / 10 items, and members can override them. Due dates fall at 23:59 local time.
- **Issue blocked when:** the member is not active, at their limit, has overdue items, or owes more than the threshold. Also blocked when the copy is not available or is held for someone else, or when members ahead in the queue would be skipped.
- **Renewals:** up to 2 (faculty 4). Refused if anyone is waiting, if the item is overdue (configurable), or if fines exceed the threshold. A renewal extends from the later of today and the current due date. Rejections notify the member.
- **Reservations:** first-come, first-served per title.
  - A freed copy goes **on hold** for the first active member in the queue, with a 3-day pickup window.
  - Uncollected holds expire and pass to the next person.
  - Placing a reservation when a copy is on the shelf creates an immediate hold.
- **Fines:** ₹5/day after a 1-day grace period, capped at ₹300 per loan. The fine is calculated at return using the policy in force at that moment. Recorded fines are never recalculated; adjust them explicitly with a reason.
- **Policy changes:**
  - Loan periods and limits apply to new loans.
  - Renewal limits apply at the next renewal.
  - Fine settings apply to returns processed after the change.
  - Existing due dates are not rewritten.
- **Reminders:** due-soon and overdue notices are keyed by loan and due date. Re-renders and repeated checks never duplicate them, and a renewal produces a fresh reminder.

## Project structure

```
src/
  app/            library facade, React providers, error boundary
  components/     ui/ (design system), layout/, books/, charts/, tables/
  features/       one folder per area (dashboard, catalog, circulation, …, patron)
  hooks/          query-string state, focus trap, chart colours, actions
  lib/            money (minor units), dates, CSV, ISBN, ids, errors
  repositories/   storage adapter, schema + migrations, integrity, transactional store
  routes/         role navigation and guards
  seed/           deterministic demo library
  services/       pure business rules (no React)
  styles/         design tokens and base styles
tests/            Vitest suites
```

## Testing and verification status

`tests/` holds 15 test files with **131 tests**, all passing:

- storage, seed data and schema migrations
- catalog, search and filtering; inventory and availability
- members; issue, return and renew; reservation queue; fines and money
- notifications, reports, import/export and backup
- role permissions and navigation
- barcode scanning, Code 128 labels, library cards and card series
- AI Librarian: question understanding, grounded answers and safe actions
- UI components (form errors, empty states, table sorting, role sidebars)

Verified on a fresh clone with a clean `npm install`: `npm run typecheck` (0 errors), `npm test` (131 passed) and `npm run build` all succeed. The logic tests were also run in the Asia/Kolkata, UTC and America/Los_Angeles time zones to catch date errors.

## Known limitations

- Browser-only persistence: no sync between devices or browsers, and no multi-user concurrency beyond tabs of the same browser, which reload on change.
- Demo sign-in is not authentication.
- Payments are recorded as local desk transactions; no payment processing.
- Book covers are generated locally (typographic) unless you supply a cover image URL. No external image service is required.
- `localStorage` holds roughly 5 MB, which is ample for thousands of loans. A larger collection should move to the IndexedDB or server adapter.
