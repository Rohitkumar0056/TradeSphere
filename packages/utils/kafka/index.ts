import { Kafka } from "kafkajs";
import * as fs from "fs";
import * as path from "path";

export const kafka = new Kafka({
    clientId: "kafka-service",
    brokers: [process.env.KAFKA_API_BROKER!],
    ssl: {
        ca: [fs.readFileSync(path.join(process.cwd(), "/packages/utils/kafka/ca.pem"), "utf-8")],
        rejectUnauthorized: true,
    },
    sasl: {
        mechanism: "scram-sha-256",
        username: process.env.KAFKA_API_KEY!,
        password: process.env.KAFKA_API_SECRET!,
    },
});