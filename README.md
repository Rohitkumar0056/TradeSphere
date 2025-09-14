# TradeSphere

🛒 **TradeSphere** is a scalable, production-ready multi-vendor e-commerce backend built with a microservices architecture and managed in a single monorepo using Nx.

## 📦 Features  

- ✔️ **Microservices architecture** (decoupled services for scalability)  
- ✔️ **Multi-role support**: User, Seller, Admin  
- ✔️ **Authentication & Authorization** with JWT  
- ✔️ **Product, Order, and Cart Management**  
- ✔️ **Inventory & Stock Tracking**  
- ✔️ **Vendor Management & Seller Dashboard APIs**  
- ✔️ **Admin Control for Monitoring & Approvals**  
- ✔️ **File uploads & optimization** with ImageKit  
- ✔️ **Redis-based caching & session management**  
- ✔️ **API Documentation** with Swagger UI

## 📂 Microservices

- **Auth Service:** User & seller registration, login, JWT, password reset, OTP, etc.
- **Product Service:** Product CRUD, categories, discounts, search, image upload.
- **Order Service:** Cart, checkout, payment (Stripe), order tracking, notifications.
- **Seller Service:** Seller profile, shop management, shop images, notifications.
- **Admin Service:** Admin dashboard, user/seller management, site config.
- **API Gateway:** Central entry point, routing, rate limiting, CORS, aggregation.

## Roles

- 👤 **User:** Browse, search, purchase products, manage profile & addresses.
- 🏬 **Seller:** Manage shop, products, orders, profile, analytics.
- 🛡️ **Admin:** Platform management, user/seller moderation, site configuration.

## 🚀 Tech Stack  

- **Runtime & Framework**: [Node.js] + [Express.js]  
- **Database**: [MongoDB]  
- **ORM**: [Prisma] 
- **Caching / Queues**: [Redis]
- **API Documentation**: [Swagger]
- **Payments**: [Stripe]
- **File & Media Storage**: [ImageKit]
- **Monorepo Management**: [Nx]

## Getting Started

### Prerequisites

- Node.js >= 18.x
- MongoDB >= 4.x
- Redis
- [ImageKit](https://imagekit.io/) account (for media storage)
- [Stripe](https://stripe.com/) account (for payments)

### Installation

1. Install dependencies:
    ```bash
    npm install
    ```
2. Set up environment variables in `.env.local`.
3. Run the development server:
    ```bash
    npm run dev
    ```
4. Database:
   Prisma is used as the ORM for MongoDB.
   Run migrations and generate Prisma client:
   ```bash
    npx prisma generate
    ```
5. API Documentation:
   Each service exposes Swagger docs:

  ```bash
  Auth: http://localhost:6001/api-docs
  Product: http://localhost:6002/api-docs
  Seller: http://localhost:6003/api-docs
  Order: http://localhost:6004/api-docs
  Admin: http://localhost:6005/api-docs
  ```

## License

MIT
