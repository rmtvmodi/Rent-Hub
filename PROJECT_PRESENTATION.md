# B.Tech Final Year / Academic Project Presentation & Viva Document

# **Project Title:** RentHub — “Rent Before You Buy”
### **Domain:** Web Application Engineering / E-Commerce & Shared Economy Platforms
### **Tech Stack:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules), Node.js, Express.js, MongoDB 9.0.4, Mongoose, JWT, Bcrypt

---

## 1. Abstract

In today’s consumer electronics and professional gear market, cutting-edge equipment (such as 4K video cameras, high-performance computing laptops, professional drones, and specialized tools) demands substantial financial investment. Often, consumers need these devices only for short durations—such as weekend shoots, academic research, or trial before purchase—resulting in heavy capital lock-in and high asset underutilization.

**RentHub — “Rent Before You Buy”** is a multi-role, full-stack rental platform engineered with a semantic HTML5, high-contrast CSS3, and vanilla JavaScript frontend connected to a robust **Node.js, Express.js, MongoDB Community Server 9.0.4, and Mongoose** REST API backend. It provides an end-to-end rental workflow—from product exploration and date reservation to simulated checkout payments, rental lifecycle state machines, late-return fee calculations, and verified customer reviews.

The platform utilizes JWT-based authentication with bcrypt password hashing and role-based access control (RBAC) across three distinct user roles: **Customer**, **Owner**, and **Administrator**. For resilience and presentation safety, the frontend includes a centralized API layer (`js/api.js`) that communicates with the Express backend and supports graceful offline fallbacks for local demonstrations.

---

## 2. Introduction

The **shared economy** model has revolutionized transportation (e.g., Uber) and hospitality (e.g., Airbnb). However, peer-to-peer equipment and lifestyle product rentals remain largely unorganized, often reliant on informal social channels or unverified classified ads without guarantees, structured return policies, or systematic inventory tracking.

RentHub introduces a formal digital ecosystem for product rentals. It provides a platform where:
- **Lenders (Owners)** list idle equipment, define daily rates, control rental availability, and earn passive income.
- **Renters (Customers)** browse verified listings, reserve items for precise calendar windows, pay via simulated checkout, track delivery/returns, and submit authenticated reviews.
- **Platform Governors (Admins)** monitor platform health, approve or reject listings, enforce quality standards, and oversee transactions.

---

## 3. Problem Statement

1. **High Cost of Short-Term Utility**: Individuals frequently require expensive equipment for brief durations (e.g., a student needing a camera for a 3-day media assignment). Buying the item outright is financially unviable.
2. **Idle Asset Depreciation**: Equipment owners possess high-value items that remain unused for weeks or months, generating zero return while depreciating in value.
3. **Absence of Rental Discipline**: Traditional informal lending suffers from scheduling clashes, uncertain returns, and a lack of penalty mechanisms for late returns.
4. **Unverified Feedback Loops**: Standard e-commerce review sections are prone to spam and fake reviews because feedback is not tied to genuine transactions.

---

## 4. Project Objectives

- **Primary Objective**: Design and implement a full-stack, peer-to-peer rental marketplace web application.
- **Backend Architecture Objective**: Build an Express REST API backend connected to MongoDB with Mongoose data modeling.
- **State Machine Objective**: Model and enforce an unambiguous 6-stage rental lifecycle (`Requested` $\rightarrow$ `Accepted` $\rightarrow$ `Paid` $\rightarrow$ `Active Rental` $\rightarrow$ `Return Requested` $\rightarrow$ `Completed`) with strict transition rules.
- **Algorithmic & Concurrency Objective**: Prevent reservation collisions via a date range overlap detection engine, supported by in-process mutex locking and deterministic collision resolution.
- **Trust & Integrity Objective**: Enforce verified rental validation so that only customers who have completed a booking can rate and review that product.
- **UI/UX Objective**: Deliver a consistent, modern midnight-blue/indigo/teal design system that performs smoothly across desktop, tablet, and mobile displays.

---

## 5. System Architecture & Tech Stack

```
+-------------------------------------------------------------------------+
|                         CLIENT LAYER (BROWSER)                          |
|  - Semantic HTML5 Pages (index, products, dashboards, details, payment) |
|  - Midnight-Blue & Teal Theme (CSS3 custom variables, Grid, Flexbox)    |
|  - Client Controllers (ES6 Modules: auth, navbar, products, owner, etc.)|
|  - Centralized API Client (js/api.js with JWT token handling)           |
+------------------------------------+------------------------------------+
                                     |  HTTP REST / JSON
                                     v
+------------------------------------+------------------------------------+
|                         SERVER LAYER (EXPRESS)                          |
|  - Node.js Runtime (ES Modules)                                         |
|  - Express Application Framework (Port 5000)                            |
|  - Security: JWT verification, bcrypt hashing, RBAC middleware          |
|  - Booking Engine: Server pricing, mutex queue & date collision engine  |
|  - Controllers: Auth, Products, Bookings, Payments, Reviews, Admin     |
+------------------------------------+------------------------------------+
                                     |  Mongoose ODM (ReadyState: 1)
                                     v
+------------------------------------+------------------------------------+
|                        DATABASE LAYER (MONGODB)                         |
|  - MongoDB Community Server 9.0.4 (mongodb://127.0.0.1:27017/renthub)   |
|  - 7 Schemas: User, Product, Booking, Payment, Review, Notification, WL |
|  - Compound Indexes, Uniqueness constraints, Dynamic $group aggregations|
+-------------------------------------------------------------------------+
```

---

## 6. Functional Modules

### 6.1 Authentication & Authorization Module
- Public registration restricted to Customer and Owner roles (Admin role creation strictly forbidden from public API).
- Passwords securely hashed with `bcryptjs` (salt rounds: 10).
- Password field configured with `select: false` to ensure password hashes are never exposed in API responses.
- Stateless authentication using JSON Web Tokens (JWT) signed with HMAC-SHA256.
- Role-based route guards (`protect` and `authorize`).

### 6.2 Product Catalog & Moderation Module
- Multi-criteria filtering by category, price range, and availability.
- Full-text search across product title, description, and category.
- Owner inventory management (Create, Read, Update, Delete, Toggle Availability).
- Admin moderation workflow: new listings default to `pending` status and only appear publicly once marked `approved`.

### 6.3 Booking Lifecycle & Concurrency Engine
- Strict calendar validation: start date cannot be in the past; end date must be on or after start date.
- Server-side duration and price calculation (client total price inputs are completely ignored).
- Concurrency protection: in-process mutex queue per product plus post-insert deterministic race verification guarantees that simultaneous booking requests never create overlapping reservations.
- Sequential state machine:
  $$\text{Requested} \longrightarrow \text{Accepted} \longrightarrow \text{Paid} \longrightarrow \text{Active Rental} \longrightarrow \text{Return Requested} \longrightarrow \text{Completed}$$
- Equipment handover confirmation by owner.
- Customer return request submission.
- Owner return inspection with automatic late fee calculation ($1.2\times$ daily rate per overdue day).

### 6.4 Simulated Payment Module
- Academic simulated checkout supporting Cards, UPI, and Net Banking.
- Method normalization ensuring robust handling across payment channels.
- Server validation: ensures booking is in `Accepted` status, user is the booking owner, and payment amount matches booking total.
- Generates unique transaction reference (`SIM-...`) and transitions booking to `Paid` / `Active Rental`.

### 6.5 Verified Reviews & Ratings Module
- Strict verification rule: customers can only review a product if they completed a confirmed rental.
- Rating bounded between 1 and 5 stars.
- Prevents duplicate reviews for the same booking.
- Dynamic rating aggregation via MongoDB `$group` aggregation pipeline, automatically updating average rating and review count on the Product document.

### 6.6 Admin Governance Module
- Aggregate platform metrics: total users, products by approval status, bookings by state, and total simulated revenue volume.
- User management: account search, role inspection, and account deactivation/activation.
- Self-protection safety checks: admins cannot deactivate or delete their own accounts.
- Platform inventory oversight and booking status override.

---

## 7. Database Design & Schemas

| # | Collection / Model | Key Fields | Purpose |
|---|---|---|---|
| 1 | **User** | `name`, `email`, `password`, `role`, `phone`, `isActive` | Multi-role identity with bcrypt password hashing |
| 2 | **Product** | `owner`, `title`, `description`, `category`, `price_per_day`, `image`, `availability`, `approval_status`, `rating`, `numReviews` | Marketplace inventory listings & admin approval |
| 3 | **Booking** | `customer`, `product`, `owner`, `start_date`, `end_date`, `total_price`, `status`, `payment_status`, `late_fee`, `return_date`, `status_history` | Rental reservations & lifecycle tracking |
| 4 | **Payment** | `booking`, `customer`, `amount`, `method`, `reference_id`, `status`, `is_simulated` | Simulated financial checkout transactions |
| 5 | **Review** | `customer`, `product`, `booking`, `rating`, `comment`, `is_verified` | Verified customer reviews & ratings |
| 6 | **Notification** | `user`, `title`, `message`, `type`, `read`, `link` | In-app user notifications & alerts |
| 7 | **Wishlist** | `customer`, `product` | User saved gear with compound uniqueness |

---

## 8. Advantages of RentHub

1. **Circular Economy & Affordability**: Reduces consumer cost barrier for high-end gear while generating passive income for lenders.
2. **Zero Framework Bloat**: Clean vanilla ES Modules frontend guarantees fast load times, minimal memory footprint, and zero dependency vulnerabilities.
3. **Robust Concurrency**: In-process mutex queue prevents double-bookings even during high-traffic simultaneous reservation requests.
4. **Data Integrity**: MongoDB persistent schemas enforce strict typing, validation rules, and relational references across models.
5. **Presentation Resilience**: Offline-tolerant architecture ensures the application continues to demonstrate smoothly even if local network or database services temporarily fluctuate.

---

## 9. Limitations & Future Scope

### Limitations
- **Simulated Payment Gateway**: Transactions are simulated for educational demonstration; no live banking APIs (e.g. Razorpay or Stripe webhooks) are used.
- **Local Single Node**: Configured for standalone MongoDB Community Server on localhost without a multi-node replica set.
- **In-App Polling**: Notifications update via REST API queries rather than real-time WebSockets.

### Future Scope
- Integration with production payment gateways (Razorpay, Stripe) with webhook verification.
- Real-time bidirectional event streaming via Socket.IO for live instant booking updates.
- Geolocation-based distance calculation and item pickup route optimization.
- Security deposit escrow management with automatic refund upon undamaged item return.
