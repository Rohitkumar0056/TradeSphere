import express from 'express';
import "./jobs/seller-crone-job";
import cookieParser from "cookie-parser";
import cors from "cors";
import { errorMiddleware } from "@packages/error-handler/error-middleware";
import router from './routes/seller.router';
import swaggerUi from 'swagger-ui-express';
const swaggerDocument = require('./swagger-output.json');

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.send({ message: 'Welcome to seller-service!' });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/docs-json", (req, res) => {
    res.json(swaggerDocument);
});

app.use("/api", router);

app.use(errorMiddleware);

const port = process.env.PORT || 6003;
const server = app.listen(port, () => {
  console.log(`Seller Service running at http://localhost:${port}/api`);
  console.log(`Swagger Docs available at http://localhost:${port}/api-docs`);
});
server.on('error', console.error);
