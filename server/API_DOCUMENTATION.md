# RentHub Marketplace REST API Documentation

**Base URL**: `http://localhost:5000/api`

---

## Architecture & Authentication Overview
- **Data Exchange**: JSON (`Content-Type: application/json`)
- **Authentication**: Bearer Token in `Authorization: Bearer <token>`
- **Protected Roles**:
  - `customer`: Can browse products, book rentals, pay, review, wishlist, read notifications.
  - `owner`: Can list products, toggle availability, accept/reject bookings, confirm returns, assess late fees.
  - `admin`: Can moderate product approvals, oversee platform bookings/payments/reviews, manage users, and view platform metrics.

---

## 1. Authentication APIs (`/api/auth`)

### 1.1 Register User
- **Method**: `POST`
- **Endpoint**: `/api/auth/register`
- **Access**: Public
- **Headers**: `Content-Type: application/json`
- **Validation Rules**:
  - `name`: Required, max 60 chars.
  - `email`: Required, valid email format, unique.
  - `password`: Required, min 6 characters.
  - `role`: Optional, permitted values: `'customer'` or `'owner'`. Default is `'customer'`.
  - **Security Rule**: Any attempt to submit `role: 'admin'` is rejected with `403 Forbidden`.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "password123",
    "role": "customer",
    "phone": "9876543210"
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": "67276b4ab123456789abcdef",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "customer",
      "phone": "9876543210"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing fields, invalid email format, password under 6 chars, or duplicate email.
  - `403 Forbidden`: `role: 'admin'` attempted via public registration.

---

### 1.2 User Login
- **Method**: `POST`
- **Endpoint**: `/api/auth/login`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "customer@example.com",
    "password": "cust123"
  }
  ```
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_id": "67276b4ab123456789abcdef",
      "name": "Demo Customer",
      "email": "customer@example.com",
      "role": "customer",
      "phone": "1234567890"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Missing email or password.
  - `401 Unauthorized`: Invalid credentials.

---

### 1.3 Get Current User Profile
- **Method**: `GET`
- **Endpoint**: `/api/auth/me`
- **Access**: Private (Authenticated)
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "user": {
      "user_id": "67276b4ab123456789abcdef",
      "name": "Demo Customer",
      "email": "customer@example.com",
      "role": "customer",
      "phone": "1234567890"
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Missing, invalid, or expired JWT.

---

## 2. Product Management APIs (`/api/products`)

### 2.1 Get Approved Marketplace Products
- **Method**: `GET`
- **Endpoint**: `/api/products`
- **Access**: Public
- **Query Parameters**:
  - `search` / `keyword`: Case-insensitive text search matching title, description, or category.
  - `category`: Category name (`Electronics`, `Cameras`, `Laptops`, `Bicycles`, `Projectors`, `Tools`, `Gaming`).
  - `availability`: `'true'` or `'available'` | `'false'` or `'unavailable'`.
  - `minPrice`: Minimum daily rate in ₹.
  - `maxPrice`: Maximum daily rate in ₹.
  - `sort`: `'price-asc'`, `'price-desc'`, `'rating'`, `'name-asc'`, default is `'newest'`.
  - `page`: Page number (default: `1`).
  - `limit`: Products per page (default: `12`).
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "count": 6,
    "total": 6,
    "totalPages": 1,
    "currentPage": 1,
    "products": [
      {
        "product_id": "67276b4ab123456789abcdef",
        "title": "Sony Alpha A7 IV Mirrorless Camera",
        "description": "33MP full-frame sensor, 4K 60p video, 28-70mm lens included.",
        "category": "Cameras",
        "price_per_day": 850,
        "availability": true,
        "approval_status": "approved",
        "image": "https://images.unsplash.com/...",
        "rating": 5,
        "numReviews": 1,
        "owner": {
          "_id": "67276b4ab123...",
          "name": "Demo Owner",
          "email": "owner@example.com",
          "phone": "0987654321"
        }
      }
    ]
  }
  ```

---

### 2.2 Get Product Details by ID
- **Method**: `GET`
- **Endpoint**: `/api/products/:id`
- **Access**: Public (Approved products) / Private (Pending products visible only to owner or admin)
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "product": { ... },
    "ratingStats": {
      "average": 4.8,
      "avg": 4.8,
      "count": 5,
      "text": "4.8 ★ (5)"
    },
    "reviews": [ ... ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid ObjectId format.
  - `404 Not Found`: Product not found or pending approval.

---

### 2.3 Create Product Listing
- **Method**: `POST`
- **Endpoint**: `/api/products`
- **Access**: Private (Owner / Admin)
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Validation Rules**:
  - Title, description, category, price_per_day, and image are mandatory.
  - Owner-created products default to `approval_status: 'pending'` (Admin must approve before public display).
  - Owner ID is set strictly from `req.user._id` (prevents mass assignment).
- **Request Body**:
  ```json
  {
    "title": "Fujifilm X-T4 Mirrorless Camera",
    "description": "26.1MP X-Trans CMOS 4 sensor, IBIS 6.5 stops, 4K 60p video.",
    "category": "Cameras",
    "price_per_day": 750,
    "image": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80",
    "availability": true
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Product submitted successfully and is pending administrative approval.",
    "product": { ... }
  }
  ```

---

### 2.4 Update Product
- **Method**: `PUT`
- **Endpoint**: `/api/products/:id`
- **Access**: Private (Owner of product / Admin)
- **Business Rule**: Non-admins cannot alter `owner` or `approval_status`.
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Product updated successfully.",
    "product": { ... }
  }
  ```

---

### 2.5 Quick Toggle Product Availability
- **Method**: `PATCH`
- **Endpoint**: `/api/products/:id/availability`
- **Access**: Private (Owner of product / Admin)
- **Request Body** (optional): `{ "availability": false }` (or toggles opposite if omitted)
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Product availability set to Unavailable.",
    "availability": false
  }
  ```

---

### 2.6 Delete Product
- **Method**: `DELETE`
- **Endpoint**: `/api/products/:id`
- **Access**: Private (Owner of product / Admin)
- **Safety Rule**: Blocked with `400 Bad Request` if the product currently has active rentals (`Paid`, `Active Rental`, or `Return Requested`).
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Product removed from marketplace successfully."
  }
  ```

---

### 2.7 Get Owner's Own Products
- **Method**: `GET`
- **Endpoint**: `/api/products/owner/my`
- **Access**: Private (Owner only)
- **Success Response (`200 OK`)**: Returns all products belonging to the authenticated owner (including `pending` and `rejected`).

---

### 2.8 Moderate Product Approval Status (Admin only)
- **Method**: `PATCH`
- **Endpoint**: `/api/products/:id/approval`
- **Access**: Private (Admin only)
- **Request Body**:
  ```json
  {
    "approval_status": "approved"
  }
  ```
- **Success Response (`200 OK`)**: Updates status and automatically notifies the product owner.

---

## 3. Booking Lifecycle APIs (`/api/bookings`)

### 3.1 Create Booking Request
- **Method**: `POST`
- **Endpoint**: `/api/bookings`
- **Access**: Private (Customer only)
- **Validation & Server Calculations**:
  - `start_date` must not be in the past.
  - `end_date` must be on or after `start_date`.
  - Product must be approved and currently available.
  - Customer cannot rent their own product.
  - **Date Overlap Prevention**: Checked against active reservations (`checkOverlap`). Conflicting requests receive `409 Conflict`.
  - **Server Total Price**: Duration days calculated server-side $\times \text{daily price}$. Never trusts client-submitted total price.
- **Request Body**:
  ```json
  {
    "product_id": "67276b4ab123456789abcdef",
    "start_date": "2026-11-10",
    "end_date": "2026-11-13"
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Booking request submitted successfully.",
    "booking": {
      "booking_id": "67276b4ab...",
      "status": "Requested",
      "payment_status": "Unpaid",
      "total_price": 3400,
      "start_date": "2026-11-10",
      "end_date": "2026-11-13"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid dates, past date, or attempting to book own product.
  - `409 Conflict`: Dates overlap with an existing confirmed reservation.

---

### 3.2 Get User's Bookings
- **Method**: `GET`
- **Endpoint**: `/api/bookings/my`
- **Access**: Private (Authenticated)
- **Lifecycle Auto-Sync**: Automatically updates `Paid` bookings whose `start_date` has arrived to `Active Rental`.

---

### 3.3 Get Booking by ID
- **Method**: `GET`
- **Endpoint**: `/api/bookings/:id`
- **Access**: Private (Customer who booked, Product Owner, or Admin)

---

### 3.4 Owner Accepts Booking
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/accept`
- **Access**: Private (Owner only)
- **State Transition**: `Requested` $\rightarrow$ `Accepted`. Dispatches notification to customer.

---

### 3.5 Owner Rejects Booking
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/reject`
- **Access**: Private (Owner only)
- **State Transition**: `Requested` $\rightarrow$ `Rejected`. Dispatches notification to customer.

---

### 3.6 Customer Cancels Booking
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/cancel`
- **Access**: Private (Customer only)
- **Rule**: Permitted only before payment (status must be `Requested` or `Accepted`).

---

### 3.7 Owner Marks Item Handed Over
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/handover`
- **Access**: Private (Owner only)
- **State Transition**: `Paid` $\rightarrow$ `Active Rental`.

---

### 3.8 Customer Requests Return
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/request-return`
- **Access**: Private (Customer only)
- **State Transition**: `Active Rental` $\rightarrow$ `Return Requested`.

---

### 3.9 Owner Confirms Return & Late Fee
- **Method**: `PATCH`
- **Endpoint**: `/api/bookings/:id/return`
- **Access**: Private (Owner only)
- **Late Fee Formula**:
  $$\text{Overdue Days} = \max\left(0, \lceil(\text{Actual Return Date} - \text{Due Date}) / 86400000\rceil\right)$$
  $$\text{Late Fee} = \text{Overdue Days} \times \text{round}(\text{Daily Rate} \times 1.2)$$
- **State Transition**: `Active Rental` or `Return Requested` $\rightarrow$ `Completed`.
- **Side Effect**: Restores product availability back to `true` and notifies customer with fee details.

---

## 4. Payment Recording APIs (`/api/payments`)

### 4.1 Process Simulated Checkout Payment
- **Method**: `POST`
- **Endpoint**: `/api/payments`
- **Access**: Private (Customer only)
- **Business Validations**:
  - Customer must own booking.
  - Booking must be in `Accepted` status and `payment_status: 'Unpaid'`.
  - Amount must match server's `booking.total_price`.
  - Prevents duplicate payment records for the same booking.
- **Request Body**:
  ```json
  {
    "booking_id": "67276b4ab123456789abcdef",
    "method": "UPI",
    "amount": 3400
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Simulated payment completed and recorded successfully.",
    "payment": {
      "payment_id": "67276b4ab...",
      "reference_id": "SIM-UPI-1730790000-4821",
      "amount": 3400,
      "method": "UPI",
      "status": "Success",
      "is_simulated": true
    },
    "booking": {
      "status": "Paid",
      "payment_status": "Paid"
    }
  }
  ```

---

### 4.2 Customer's Payment History
- **Method**: `GET`
- **Endpoint**: `/api/payments/my`
- **Access**: Private (Customer only)

---

### 4.3 All Platform Payment Receipts (Admin only)
- **Method**: `GET`
- **Endpoint**: `/api/payments`
- **Access**: Private (Admin only)
- **Response**: Returns all payments plus `totalVolume` sum in ₹.

---

## 5. Verified Reviews & Ratings APIs (`/api/reviews`)

### 5.1 Submit Verified Review
- **Method**: `POST`
- **Endpoint**: `/api/reviews`
- **Access**: Private (Customer only)
- **Verification Rules**:
  - Customer must have a booking for that product with status `Completed`.
  - Compound unique constraint prevents multiple reviews for the same booking.
  - Dynamically recalculates product rating average and count.
- **Request Body**:
  ```json
  {
    "booking_id": "67276b4ab123456789abcdef",
    "rating": 5,
    "comment": "Superb mirrorless camera! In flawless condition and included extra batteries."
  }
  ```
- **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "message": "Verified review submitted successfully.",
    "review": { ... },
    "newRatingStats": {
      "average": 5.0,
      "count": 1,
      "text": "5.0 ★ (1)"
    }
  }
  ```

---

### 5.2 Get Product Reviews
- **Method**: `GET`
- **Endpoint**: `/api/reviews/product/:productId`
- **Access**: Public

---

### 5.3 Delete Review
- **Method**: `DELETE`
- **Endpoint**: `/api/reviews/:id`
- **Access**: Private (Author of review or Admin)
- **Side Effect**: Recalculates product star rating dynamically.

---

## 6. Wishlist APIs (`/api/wishlists`)

### 6.1 Get Customer's Wishlist
- **Method**: `GET`
- **Endpoint**: `/api/wishlists`
- **Access**: Private (Customer only)

---

### 6.2 Add to Wishlist
- **Method**: `POST`
- **Endpoint**: `/api/wishlists`
- **Access**: Private (Customer only)
- **Request Body**: `{ "product_id": "67276b4ab..." }`
- **Rule**: Duplicate saves are prevented with `400 Bad Request`.

---

### 6.3 Remove from Wishlist
- **Method**: `DELETE`
- **Endpoint**: `/api/wishlists/:productId`
- **Access**: Private (Customer only)

---

## 7. In-App Notifications APIs (`/api/notifications`)

### 7.1 Get User Notifications
- **Method**: `GET`
- **Endpoint**: `/api/notifications`
- **Access**: Private (Authenticated)
- **Response**: Returns notification array and `unreadCount`.

---

### 7.2 Mark Single Notification Read
- **Method**: `PATCH`
- **Endpoint**: `/api/notifications/:id/read`
- **Access**: Private (Recipient only)

---

### 7.3 Mark All Read
- **Method**: `PATCH`
- **Endpoint**: `/api/notifications/read-all`
- **Access**: Private (Authenticated)

---

## 8. Admin Management APIs (`/api/admin`)

All `/api/admin` endpoints strictly require `protect` and `authorize('admin')`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/metrics` | Platform summary counts (users, active listings, pending approvals, bookings, revenue volume in ₹). |
| `GET` | `/api/admin/users` | List all registered users with search, role filters, and pagination. |
| `GET` | `/api/admin/users/:id` | View detailed user account profile. |
| `PATCH` | `/api/admin/users/:id` | Update permitted user fields (name, phone, role). Prevents admin self-demotion. |
| `PATCH` | `/api/admin/users/:id/status` | Deactivate/Reactivate user account (`isActive: true/false`). Prevents self-deactivation. |
| `DELETE` | `/api/admin/users/:id` | Delete user account. Prevents self-deletion. |
| `GET` | `/api/admin/products` | View all marketplace listings regardless of approval status. |
| `GET` | `/api/admin/bookings` | View all platform bookings with status filter. |
| `PATCH` | `/api/admin/bookings/:id/status` | Administrative override of booking lifecycle status. |
| `GET` | `/api/reviews` | View all platform customer reviews for moderation. |
| `GET` | `/api/payments` | View all platform simulated payment records. |
