import swaggerAutogen from "swagger-autogen";

const doc = {
    info: {
        title: "Seller Service API",
        description: "Automatically generated Swagger docs",
        version: "1.0.0",
    },
    host: "localhost:6001",
    schemes: ["http"],
};

const outputFile = "./swagger-output.json";
const endpointsFiles = ["./routes/seller.router.ts"];

swaggerAutogen()(outputFile, endpointsFiles, doc);