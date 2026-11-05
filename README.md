# RentHub — “Rent Before You Buy”

> **A modern, peer-to-peer full-stack rental marketplace empowering users to access high-end technology, photography equipment, tools, and lifestyle gear without the commitment of outright purchase.**

---

## 1. Project Overview

**RentHub** is a multi-role, full-stack rental platform built with a semantic HTML5, high-contrast CSS3, and vanilla JavaScript (ES Modules) frontend connected to a robust **Node.js, Express.js, MongoDB, and Mongoose** REST API backend. It provides an end-to-end rental workflow—from product exploration and date reservation to simulated checkout payments, rental lifecycle state machines, late-return fee calculations, and verified customer reviews.

The platform utilizes JWT-based authentication with bcrypt password hashing and role-based access control (RBAC) across three distinct user roles: **Customer**, **Owner**, and **Administrator**. For resilience, the frontend includes a centralized API layer (`js/api.js`) that communicates with the Express backend and supports graceful offline fallbacks for local demonstrations.

---

## 2. Technology Stack

### Frontend Architecture
- **Markup**: Semantic HTML5 (`<nav>`, `<main>`, `<section>`, `<article>`, `<table>`, `<dialog>`)
- **Styling**: Modular CSS3 with custom variables (Midnight-blue `#0B1220`, Indigo `#7C6CF2`, Teal `#2DD4BF`, Rose `#FB7185`), Flexbox, CSS Grid, and responsive breakpoints.
- **Client Logic**: Vanilla JavaScript (ES6+ Modules) with zero frontend framework bloat.
- **API Integration Layer**: `js/api.js` with centralized token management, error formatting, and request dispatching.

### Backend Architecture
- **Runtime**: Node.js (v18.0.0 or higher recommended; ES Modules `"type": "module"`)
- **Framework**: Express.js (v4.19+)
- **Database & ODM**: MongoDB with Mongoose (v8.2+)
- **Security & Authentication**:
  - JSON Web Tokens (`jsonwebtoken`) with configurable expiry
  - Password hashing via `bcryptjs`
  - Strict role-based route middleware (`protect`, `authorize`)
  - Server-side date conflict engine and concurrency race prevention
- **Cross-Origin Resource Sharing**: `cors` configured for local development servers (e.g. Live Server on port 5500, Vite, or direct Express port 5000).

---

## 3. Required Software & Prerequisites

Before running the application, ensure the following software is installed on your workstation:
1. **Node.js** (v18.x or v20.x or higher) — [Download Node.js](https://nodejs.org/)
2. **npm** (Node Package Manager, bundled with Node.js)
3. **MongoDB** (One of the following):
   - **Local MongoDB Community Server**: Installed and running as a service (default: `mongodb://127.0.0.1:27017/renthub`).
   - **MongoDB Atlas Cloud Cluster**: Free cloud database cluster connection string.

---

## 4. Installation & Setup Instructions

### Step 1: Clone or Open the Project
Open your terminal (PowerShell, Command Prompt, or bash) in the project directory:
```bash
cd "c:\Users\rahul\Documents\Projects\RentHub\RentHub web"
```

### Step 2: Install Backend Dependencies
Navigate to the `server/` directory and install the required npm packages:
```bash
cd server
npm install
cd ..
```

### Step 3: Configure Environment Variables
Copy the template file `server/.env.example` to `server/.env`:
```powershell
cp server/.env.example server/.env
```
Open `server/.env` in your text editor and configure your variables:
```env
PORT=5000
NODE_ENV=development

# MongoDB Connection String (Local or MongoDB Atlas)
MONGO_URI=mongodb://127.0.0.1:27017/renthub

# JWT Configuration
JWT_SECRET=your_development_jwt_secret_here
JWT_EXPIRE=7d

# Allowed Frontend Origins for CORS (comma-separated)
CLIENT_URL=http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000
```
*(Never commit actual production secrets, passwords, or private environment files to version control.)*

### Step 4: Start MongoDB
- **Local MongoDB**: Ensure the MongoDB service is running on Windows:
  ```powershell
  net start MongoDB
  ```
- **MongoDB Atlas**: Replace `MONGO_URI` in `server/.env` with your cluster connection URI:
  ```env
  MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/renthub?retryWrites=true&w=majority
  ```

### Step 5: Seed Demo Database (Optional but Recommended)
Populate the database with canonical demo accounts, approved product listings, and sample reviews:
```bash
node server/seeder/seeder.js
```

---

## 5. Launching the Application

### Option A: Direct Full-Stack Launch via Express (Single Command)
The Express server is configured to serve both the REST API and the frontend client simultaneously:
```bash
node server/server.js
```
- Open your browser and navigate to: **`http://localhost:5000`**
- REST API is available at: **`http://localhost:5000/api`**
- Health check endpoint: **`http://localhost:5000/api/health`**

### Option B: VS Code Live Server (Frontend) + Express (Backend)
1. Start the backend API:
   ```bash
   node server/server.js
   ```
2. Open the project folder in VS Code, right-click `index.html`, and select **“Open with Live Server”**.
3. The frontend loads at `http://127.0.0.1:5500` and automatically connects to the backend at `http://localhost:5000/api`.

---

## 6. Frontend API Base URL Configuration

The centralized frontend API client is located at `js/api.js`. It defaults to:
- Relative `/api` if opened from port `5000`.
- `http://localhost:5000/api` if opened from Live Server (`5500`) or any other origin.

To override the API URL without modifying source code, you can set it in your browser console or in `localStorage`:
```javascript
localStorage.setItem('renthub_api_url', 'http://localhost:5000/api');
```
Or set `window.RENTHUB_API_URL` prior to script execution.

---

## 7. Pre-Configured Demo Accounts

The following demo accounts are available for evaluation:

| Role | Email Address | Password | Permissions & Intended Workflow |
|---|---|---|---|
| **Customer** | `customer@example.com` | `cust123` | Browsing gear, submitting rental reservations, checkout payment simulation, tracking active rentals, requesting returns, posting verified reviews. |
| **Owner** | `owner@example.com` | `owner123` | Listing new products (defaults to pending approval), toggling availability, accepting/rejecting bookings, inspecting returns, reviewing earnings. |
| **Admin** | `admin@example.com` | `admin123` | System metrics, approving/rejecting product inventory, toggling user active status, overriding booking statuses, moderating reviews. |

*Security Notice*: Administrative accounts cannot be created via the public registration form; they can only be generated through the secure seeder or administrative provision.

---

## 8. REST API Reference Overview

Complete documentation for all 26 endpoints is provided in [`server/API_DOCUMENTATION.md`](file:///c:/Users/rahul/Documents/Projects/RentHub/RentHub%20web/server/API_DOCUMENTATION.md).

| Category | Endpoint | Method | Access | Description |
|---|---|---|---|---|
| **Health** | `/api/health` | `GET` | Public | Server uptime and live MongoDB readiness status |
| **Auth** | `/api/auth/register` | `POST` | Public | Customer & Owner registration (Admin blocked) |
| **Auth** | `/api/auth/login` | `POST` | Public | Authenticate user & return signed JWT Bearer token |
| **Auth** | `/api/auth/me` | `GET` | Private | Retrieve authenticated user profile (session check) |
| **Products** | `/api/products` | `GET` | Public | List approved products with search, filters, pagination |
| **Products** | `/api/products/:id` | `GET` | Public | Single product details, live rating stats & reviews |
| **Products** | `/api/products` | `POST` | Owner/Admin | Create product listing (Owner defaults to pending) |
| **Products** | `/api/products/:id` | `PUT` | Owner/Admin | Update product listing details |
| **Products** | `/api/products/:id` | `DELETE` | Owner/Admin | Delete product listing |
| **Products** | `/api/products/:id/approval`| `PATCH`| Admin | Moderate listing (`approved`, `pending`, `rejected`) |
| **Bookings** | `/api/bookings` | `POST` | Customer | Reserve product with date overlap & race checks |
| **Bookings** | `/api/bookings/my` | `GET` | Private | Retrieve current user's customer/owner bookings |
| **Bookings** | `/api/bookings/:id/accept` | `PATCH` | Owner | Approve pending booking request |
| **Bookings** | `/api/bookings/:id/reject` | `PATCH` | Owner | Decline pending booking request |
| **Bookings** | `/api/bookings/:id/cancel` | `PATCH` | Customer | Cancel booking prior to handover |
| **Bookings** | `/api/bookings/:id/request-return` | `PATCH` | Customer | Initiate product return |
| **Bookings** | `/api/bookings/:id/return` | `PATCH` | Owner | Confirm return & calculate late fees ($1.2\times$) |
| **Payments** | `/api/payments` | `POST` | Customer | Process simulated payment & update booking status |
| **Reviews** | `/api/reviews` | `POST` | Customer | Post verified review for completed rental booking |
| **Wishlists** | `/api/wishlists` | `GET`, `POST`, `DELETE` | Private | Manage user's saved wishlist items |
| **Notifications** | `/api/notifications` | `GET`, `PATCH`, `DELETE` | Private | Retrieve, mark read, and manage notifications |
| **Admin** | `/api/admin/metrics` | `GET` | Admin | Aggregate platform counters and volume in ₹ |
| **Admin** | `/api/admin/users` | `GET` | Admin | Paginated user management with role & status filters |
| **Admin** | `/api/admin/users/:id/status`| `PATCH` | Admin | Toggle user active/disabled status |
| **Admin** | `/api/admin/users/:id` | `DELETE` | Admin | Delete user (self-deletion blocked) |

---

## 9. Automated Testing Suites

Execute any of the test suites using Node.js:

```powershell
# 1. Real Google Chrome Browser E2E Suite (Phase 5 - 18/18 Passed)
node server/test_browser_e2e.js

# 2. Security Audit, Concurrency Race & Journey Suite (Phase 5 - 28/28 Passed)
node server/test_concurrency_security.js

# 3. Live MongoDB Database CRUD & E2E Persistence Suite (15/15 Passed)
node server/verify_db_persistence.js

# 4. Server Disconnect & Cross-Reboot Persistence Test (1/1 Passed)
node server/test_restart_persistence.js

# 5. Frontend-Backend Integration Test Suite (Phase 4 - 16/16 Passed)
node server/test_frontend_integration.js

# 6. Complete Marketplace REST API Suite (Phase 3 - 17/17 Passed)
node server/test_marketplace.js

# 7. Authentication & RBAC Test Suite (Phase 2 - 20/20 Passed)
node server/test_auth.js

# 8. Mongoose Data Models & Schemas Suite (Phase 1 - 7/7 Passed)
node server/test_models.js
```

---

## 10. Current Limitations & Clarifications

1. **Simulated Payments**: Financial transactions are simulated for demonstration purposes. No real banking networks, payment gateways (e.g. Razorpay, Stripe), or credit card charges take place.
2. **MongoDB Connectivity**: When the local MongoDB daemon is stopped or offline, the Express server remains online and serves static assets and health responses, while the frontend falls back gracefully to local browser storage so demonstrations never break or freeze.
3. **Database Concurrency**: Tested and proven with in-process Promise mutex locks and post-insert collision verification on local standalone MongoDB Community Server 9.0.4.

---

## 11. Project Directory Structure

```text
RentHub web/
├── index.html                  # Homepage (Hero, Categories, Featured Products, FAQ)
├── products.html               # Public marketplace browsing with search, filters & sort
├── product-details.html        # Detailed product view, date selection, reviews, booking
├── about.html                  # Platform mission, operational model, and specifications
├── login.html                  # Authentication login page with quick demo account shortcuts
├── register.html               # Public registration form (Customer & Owner accounts)
├── customer-dashboard.html     # Customer portal: rentals, timeline, history, wishlist, reviews
├── owner-dashboard.html        # Owner portal: inventory performance, earnings, approvals, returns
├── admin-dashboard.html        # Admin portal: platform metrics, inventory moderation, users
├── payment.html                # Simulated payment checkout (Cards, UPI, Net Banking)
├── README.md                   # Complete full-stack documentation
├── PROJECT_PRESENTATION.md     # Academic project presentation & viva overview
├── DEMO_WALKTHROUGH.md         # Step-by-step presentation demonstration guide
├── VIVA_PREPARATION.md         # 45 B.Tech viva interview questions & detailed answers
├── css/
│   └── style.css               # Midnight-blue design system & responsive layout rules
├── js/
│   ├── api.js                  # Centralized REST API client (Fetch wrapper, auth tokens, errors)
│   ├── auth.js                 # Authentication state, session handling, dynamic navbar sync
│   ├── navbar.js               # Responsive mobile navigation drawer controller
│   ├── app.js                  # Homepage dynamic features & featured products
│   ├── products.js             # Marketplace search, filtering, category pre-fill, wishlist
│   ├── product-details.js      # Date selection, overlap validation, booking creation, review posting
│   ├── customer-dashboard.js   # Customer metrics, visual timelines, return requests, review modals
│   ├── owner.js                # Owner analytics, performance tables, availability toggles, returns
│   ├── admin.js                # Admin moderation, product approvals, user management, review deletion
│   ├── payment.js              # Checkout transaction recording, status update to Paid / Active Rental
│   └── storage.js              # Resilient fallback client data storage & local schema
└── server/
    ├── server.js               # Express application entrypoint (API routes + static serving)
    ├── package.json            # Node.js ES Modules configuration & dependencies
    ├── .env                    # Active environment variables
    ├── .env.example            # Environment variable template
    ├── API_DOCUMENTATION.md    # Complete REST API endpoint reference
    ├── config/
    │   └── db.js               # MongoDB Mongoose connection with live state tracking
    ├── utils/
    │   ├── jwt.js              # JWT signing, verification, and decoding utilities
    │   └── notify.js           # In-app notification dispatcher with deduplication
    ├── middleware/
    │   └── authMiddleware.js   # protect (JWT verification) & authorize (...roles)
    ├── models/
    │   ├── User.js             # User schema with bcrypt, isActive, and virtuals
    │   ├── Product.js          # Product schema with approval status & rating aggregation
    │   ├── Booking.js          # Booking schema with MongoDB Dates & state machine
    │   ├── Payment.js          # Simulated payment transaction schema
    │   ├── Review.js           # Verified rental review schema & $group rating aggregation
    │   ├── Notification.js     # User notification schema
    │   └── Wishlist.js         # Wishlist schema with compound uniqueness
    ├── controllers/
    │   ├── authController.js   # Authentication controller
    │   ├── productController.js# Product catalog & moderation controller
    │   ├── bookingController.js# Booking lifecycle & collision prevention controller
    │   ├── paymentController.js# Simulated payment controller
    │   ├── reviewController.js # Verified review controller
    │   ├── wishlistController.js# Wishlist controller
    │   ├── notifController.js  # Notifications controller
    │   └── adminController.js  # Admin metrics & oversight controller
    ├── routes/                 # Express route definitions mounted under /api/*
    ├── seeder/
    │   └── seeder.js           # Canonical demo data seeder
    ├── test_browser_e2e.js     # Phase 5 Real Chrome browser E2E test suite
    ├── test_concurrency_security.js # Phase 5 Concurrency race & security audit suite
    ├── verify_db_persistence.js# Live MongoDB CRUD and E2E persistence suite
    ├── test_restart_persistence.js  # Server reboot persistence suite
    ├── test_frontend_integration.js # Phase 4 Integration verification suite
    ├── test_marketplace.js     # Phase 3 Marketplace verification suite
    ├── test_auth.js            # Phase 2 Authentication verification suite
    └── test_models.js          # Phase 1 Mongoose models verification suite
```

---

## 12. Academic Attribution & License

Developed as a college engineering capstone project under the title **RentHub — “Rent Before You Buy”**. All code is written for educational and demonstrational purposes.
