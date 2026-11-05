# RentHub — Complete Demonstration Walkthrough & Script

This document details the exact sequence of steps for demonstrating the **RentHub — “Rent Before You Buy”** project to professors, evaluators, and viva panels.

---

## Pre-Demonstration Checklist

1. **Verify MongoDB Service**:
   Ensure MongoDB Community Server is running on port 27017 (`mongodb://127.0.0.1:27017/renthub`).
2. **Start Backend Server**:
   ```powershell
   cd server
   npm start
   ```
   *Verify console output: `[RentHub DB] MongoDB Connected successfully: 127.0.0.1/renthub`.*
3. **Open Browser**:
   Navigate to `http://localhost:5000` (or `http://localhost:5500` via Live Server).
4. **Seed Demonstration Accounts**:
   ```powershell
   cd server
   npm run seed
   ```

### Default Demo Credentials
- **Customer**: `customer@example.com` / `cust123`
- **Owner**: `owner@example.com` / `owner123`
- **Admin**: `admin@example.com` / `admin123`

---

## Sequence 1: Public Marketplace & Customer Experience

### 1.1 Homepage & Design System (`index.html`)
- **Action**: Open `http://localhost:5000/index.html`.
- **Explain to Panel**:
  - Show the cohesive midnight-blue (`#0B1220`), indigo (`#7C6CF2`), and teal (`#2DD4BF`) design system.
  - Highlight the responsive navigation bar displaying *Home*, *Browse Products*, *About*, and *Login / Register*.
  - Show category shortcut pills and live featured rental items loaded directly from the backend.
  - Resize the browser window to mobile width ($375\text{px}$) to demonstrate the responsive hamburger menu toggle (`#nav-toggle`).

### 1.2 Catalog Browsing, Search & Multi-Filters (`products.html`)
- **Action**: Click **Browse Products** in the navigation bar.
- **Explain to Panel**:
  - Show all 6 seeded products dynamically loaded from MongoDB.
  - Type `Canon` in the search box: note how the catalog instantly filters in real-time.
  - Filter by Category (e.g. *Cameras* or *Laptops*) and Price Range.
  - Click **Reset All Filters** to restore the catalog.

### 1.3 User Registration & Authentication (`register.html` & `login.html`)
- **Action**: Click **Login / Register** $\rightarrow$ **Create an Account**.
- **Demonstration**:
  - Show that public registration only permits **Customer** and **Owner** account types (the Admin role is excluded for security).
  - Register a new customer account or log in with `customer@example.com` / `cust123`.
  - Notice the navbar updates immediately across all pages: *Login / Register* is replaced with *Dashboard*, a live notification bell (`🔔`), and *Logout*.

### 1.4 Product Details, Wishlist & Reservation (`product-details.html`)
- **Action**: Navigate to *Browse Products* $\rightarrow$ Click **Rent Now** on the *Canon EOS 90D DSLR Camera*.
- **Demonstration**:
  - Show verified specifications, daily rate (₹1,200/day), lender name, and verified customer reviews.
  - Click **♡ Add to Wishlist**: updates to **♥ Remove from Wishlist** with persistent MongoDB storage.
  - Select Rental Start Date (e.g., 5 days from today) and End Date (7 days from today).
  - Note how duration (3 days) and total price (₹3,600) are automatically calculated and displayed.
  - Click **Submit Booking Request**. A confirmation alert appears and redirects to the Customer Dashboard.

### 1.5 Customer Dashboard & Status Tracking (`customer-dashboard.html`)
- **Action**: Open the Customer Dashboard.
- **Demonstration**:
  - Point to the **Active Rentals** section showing Booking `#...` in `Requested` status.
  - Show the 6-stage visual timeline tracker indicating the current step (*Requested*).
  - Show the notification bell showing a new in-app alert.

---

## Sequence 2: Equipment Owner Experience

### 2.1 Owner Login & Analytics Dashboard (`owner-dashboard.html`)
- **Action**: Logout and log in as Owner (`owner@example.com` / `owner123`).
- **Demonstration**:
  - Point to real-time analytics cards: *Total Listed Products*, *Pending Requests*, *Active Rentals*, and *Total Earnings (₹)*.
  - Show the **Product Performance** table displaying inventory, rental frequency, and revenue.

### 2.2 Adding New Product with Moderation Workflow
- **Action**: Scroll to **Add New Product**.
- **Demonstration**:
  - Enter product details: Title (*DJI Mini 3 Pro Drone*), Category (*Cameras*), Daily Price (*1500*), and Image URL.
  - Click **Add Product to Marketplace**.
  - Notice the product card immediately appears with a yellow **pending** approval badge.
  - Open an incognito browser window (as a guest) and check `products.html`: the pending product is **NOT** visible to the public, verifying the admin moderation security rule.

### 2.3 Managing Incoming Rental Requests
- **Action**: Scroll to **Booking Requests & Active Rentals**.
- **Demonstration**:
  - Locate the booking request submitted earlier by the customer.
  - Click **Accept**.
  - The status advances to `Accepted`, and a notification is automatically dispatched to the customer informing them to proceed to payment.

---

## Sequence 3: Simulated Payment & Equipment Handover

### 3.1 Customer Checkout (`payment.html`)
- **Action**: Switch back to the Customer account.
- **Demonstration**:
  - On the Customer Dashboard, the booking now displays **💳 Pay Now (₹3,600)**.
  - Click **Pay Now**.
  - Show the verified booking summary and simulated payment channels (*UPI*, *Credit / Debit Card*, *Net Banking*).
  - Select **UPI** and click **Confirm & Pay ₹3,600**.
  - The transaction completes, recording a `Payment` document in MongoDB and advancing the booking status to `Paid` (or `Active Rental`).

### 3.2 Owner Equipment Handover (`owner-dashboard.html`)
- **Action**: Return to the Owner portal.
- **Demonstration**:
  - The booking reflects `Paid` with confirmed payment badge.
  - Click **Handover Gear**: advances status to `Active Rental`.

---

## Sequence 4: Return Lifecycle & Verified Review

### 4.1 Requesting Product Return
- **Action**: In the Customer Dashboard, click **📦 Request Product Return**.
- **Demonstration**: Status transitions to `Return Requested`.

### 4.2 Owner Inspection & Late Fee Assessment
- **Action**: In the Owner Dashboard, click **Confirm Return**.
- **Demonstration**:
  - The system checks actual return date against scheduled due date.
  - If returned on time, late fee is ₹0. If overdue, assesses $1.2\times$ daily rate per overdue day.
  - Status transitions to `Completed`, and the product's availability is automatically restored to `Available`.

### 4.3 Verified Review Submission (`product-details.html`)
- **Action**: In Customer Dashboard under Rental History $\rightarrow$ Click **★ Write Review**.
- **Demonstration**:
  - Enter 5 Stars and write a review comment (*"Outstanding camera, captured amazing shots!"*).
  - Submit the review.
  - Open the product's details page: show the new review listed with the customer's name, star rating, timestamp, and updated average product rating.
  - Note: Try submitting a review on an unrented product $\rightarrow$ the system strictly prevents unverified reviews.

---

## Sequence 5: Platform Administrator Governance

### 5.1 Admin Dashboard Metrics (`admin-dashboard.html`)
- **Action**: Log in as Admin (`admin@example.com` / `admin123`).
- **Demonstration**:
  - Show platform metrics: total users by role, product approval counts (*Approved*, *Pending*, *Rejected*), active rentals, and total simulated platform volume in ₹.

### 5.2 Product Moderation
- **Action**: Navigate to **Product Approval & Moderation**.
- **Demonstration**:
  - Locate the owner's pending *DJI Mini 3 Pro Drone* listing.
  - Click **Approve**: the product status updates to `approved` in MongoDB.
  - Open `products.html` in another tab: the drone is now publicly visible in the marketplace!

### 5.3 User Governance & Self-Protection Rules
- **Action**: Under **Registered Users**:
  - Show user search by name and email.
  - Toggle a test user account status to *Deactivated*.
  - Point out the self-protection security feature: the admin's own account has no Deactivate or Delete buttons, preventing accidental lockout.
