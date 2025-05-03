import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TimeSeriesDB } from '../src/timeseries';
import { MongoDbEngine } from '../src/engine/MongoEngine';
import { MongoClient } from 'mongodb';

const connectionString = `mongodb://${'mongodbusername'}:${'mongodbpassword'}@localhost:27017`;
const dbName = 'local-unified-db';
const collectionName = 'local-unified-db-collection';

let db: TimeSeriesDB;
let client: MongoClient;

describe('TimeSeriesDB', () => {
    beforeAll(async () => {
        const engine = new MongoDbEngine({
            uri: `mongodb://${'mongodbusername'}:${'mongodbpassword'}@localhost:27017`,
            dbName: 'local-unified-db',
            collectionName: "readings",
            timeField: "timestamp",
            granularity: "seconds",
        });
        db = new TimeSeriesDB(engine);
        db.connect();

        client = new MongoClient(connectionString);
        await client.connect();
    });

    afterAll(async () => {
        await db.close();
        const testDb = client.db(dbName);
        await testDb.dropDatabase();
        await client.close();
    });

    it('should create a timeseries collection if it does not exist', async () => {
        const collections = await client.db(dbName).listCollections().toArray();
        const collectionNames = collections.map((col) => col.name);
        expect(collectionNames).toContain(collectionName);
    });

    it('should insert a single document into the timeseries collection', async () => {
        const testData = {
            timestamp: new Date(),
            value: 25.3,
            sensor: 'sensorA',
        };

        await db.insert(testData);

        const result = await db.query({ sensor: 'sensorA' });
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe(25.3);
    });

    it('should insert multiple documents into the timeseries collection', async () => {
        const testData = [
            { timestamp: new Date(), value: 20.1, sensor: 'sensorB' },
            { timestamp: new Date(), value: 21.5, sensor: 'sensorB' },
        ];

        await db.insert(testData);

        const result = await db.query({ sensor: 'sensorB' });
        expect(result).toHaveLength(2);
        expect(result[0].value).toBe(20.1);
        expect(result[1].value).toBe(21.5);
    });

    it('should query documents with a filter and sort them by the timeField', async () => {
        const testData = [
            { timestamp: new Date('2025-05-01T10:00:00Z'), value: 18.5, sensor: 'sensorC' },
            { timestamp: new Date('2025-05-01T09:00:00Z'), value: 19.0, sensor: 'sensorC' },
        ];

        await db.insert(testData);

        const result = await db.query({ sensor: 'sensorC' });
        expect(result).toHaveLength(2);
        expect(result[0].timestamp).toEqual(new Date('2025-05-01T09:00:00Z'));
        expect(result[1].timestamp).toEqual(new Date('2025-05-01T10:00:00Z'));
    });

    it('should handle empty query results gracefully', async () => {
        const result = await db.query({ sensor: 'nonexistentSensor' });
        expect(result).toHaveLength(0);
    });

    it('should aggregate data by time bucket with average operation', async () => {
        const testData = [
            { timestamp: new Date('2025-05-01T09:00:00Z'), value: 10, sensor: 'sensorD' },
            { timestamp: new Date('2025-05-01T09:30:00Z'), value: 20, sensor: 'sensorD' },
            { timestamp: new Date('2025-05-01T10:00:00Z'), value: 30, sensor: 'sensorD' },
        ];

        await db.insert(testData);

        const result = await db.aggregateByTimeBucket({
            interval: 'hours',
            valueField: 'value',
            operation: 'avg',
            match: { sensor: 'sensorD' },
        });

        expect(result).toHaveLength(2);
        expect(result[0]._id).toEqual(new Date('2025-05-01T09:00:00Z'));
        expect(result[0].value).toBe(15); // Average of 10 and 20
        expect(result[1]._id).toEqual(new Date('2025-05-01T10:00:00Z'));
        expect(result[1].value).toBe(30);
    });

    it('should downsample data into a target collection', async () => {
        const testData = [
            { timestamp: new Date('2025-05-01T09:00:00Z'), value: 10, sensor: 'sensorE' },
            { timestamp: new Date('2025-05-01T09:30:00Z'), value: 20, sensor: 'sensorE' },
            { timestamp: new Date('2025-05-01T10:00:00Z'), value: 30, sensor: 'sensorE' },
        ];

        await db.insert(testData);

        const downsampledData = await db.downsample({
            interval: 'hours',
            valueField: 'value',
            operation: 'avg',
            targetCollection: 'sensorE_hourly_avg',
            match: { sensor: 'sensorE' },
        });

        const targetCollection = client.db(dbName).collection('sensorE_hourly_avg');
        const storedData = await targetCollection.find().toArray();

        expect(downsampledData).toHaveLength(2);
        expect(downsampledData[0].timestamp).toEqual(new Date('2025-05-01T09:00:00Z'));
        expect(downsampledData[0].value).toBe(15); // Average of 10 and 20
        expect(downsampledData[1].timestamp).toEqual(new Date('2025-05-01T10:00:00Z'));
        expect(downsampledData[1].value).toBe(30);

        expect(storedData).toHaveLength(2);
        expect(storedData[0].timestamp).toEqual(new Date('2025-05-01T09:00:00Z'));
        expect(storedData[0].value).toBe(15);
        expect(storedData[1].timestamp).toEqual(new Date('2025-05-01T10:00:00Z'));
        expect(storedData[1].value).toBe(30);
    });

});