import express from 'express';
import cookieParse from "cookie-parser";
import { errorMiddleware } from '@packages/error-handler/error-middleware';
import router from './routes/admin.route';
import swaggerUi from 'swagger-ui-express';
const swaggerDocument = require('./swagger-output.json');

const app = express();
app.use(express.json());
app.use(cookieParse());

app.get('/', (req, res) => {
  res.send({ message: 'Welcome to admin-service!' });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/docs-json", (req, res) => {
    res.json(swaggerDocument);
});

app.use("/api", router);

app.use(errorMiddleware);

const port = process.env.PORT || 6005;
const server = app.listen(port, () => {
  console.log(`Admin Service is running at http://localhost:${port}/api`);
  console.log(`Swagger Docs available at http://localhost:${port}/docs`);
});
server.on('error', console.error);
