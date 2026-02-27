import swaggerAutogen from "swagger-autogen";

const doc = {
    info: {
        title: "Order Service API",
        description: "Automatically generated Swagger docs",
        version: "1.0.0",
    },
    host: "localhost:6004",
    basePath: "/api",
    schemes: ["http"],
};

const outputFile = "./swagger-output.json";
const endpointsFiles = ["./routes/order.route.ts"];

swaggerAutogen()(outputFile, endpointsFiles, doc);