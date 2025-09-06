import express from 'express';
import cookieParse from "cookie-parser";
import { errorMiddleware } from '@packages/error-handler/error-middleware';
import router from './routes/admin.route';

const app = express();
app.use(express.json());
app.use(cookieParse());

app.get('/', (req, res) => {
  res.send({ message: 'Welcome to admin-service!' });
});

app.use("/api", router);

app.use(errorMiddleware);

const port = process.env.PORT || 6005;
const server = app.listen(port, () => {
  console.log(`Admin Service is running at http://localhost:${port}/api`);
});
server.on('error', console.error);
