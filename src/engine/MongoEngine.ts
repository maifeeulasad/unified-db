import {
    MongoClient,
    Db,
    Collection,
    Document,
} from "mongodb";
import {
    DbEngine,
    AggregateOptions,
    DownsampleOptions,
    DataRecord,
    Filter,
    Sort,
} from "./DbEngine";

export interface MongoDbOptions {
    dbName: string;
    collectionName: string;
    uri: string;
    timeField: string;
    metaField?: string;
    granularity?: "seconds" | "minutes" | "hours";
}

export class MongoDbEngine extends DbEngine {
    private client: MongoClient;
    private db: Db;
    private collection!: Collection<Document>;

    constructor(private options: MongoDbOptions) {
        super();
        this.client = new MongoClient(options.uri);
    }

    async connect(): Promise<void> {
        await this.client.connect();
        this.db = this.client.db(this.options.dbName);

        const exists = await this.db
            .listCollections({ name: this.options.collectionName })
            .next();

        if (!exists) {
            await this.db.createCollection(this.options.collectionName, {
                timeseries: {
                    timeField: this.options.timeField,
                    metaField: this.options.metaField,
                    granularity: this.options.granularity || "seconds",
                },
            });
        }

        this.collection = this.db.collection(this.options.collectionName);
    }

    async insert(data: DataRecord | DataRecord[]): Promise<void> {
        if (Array.isArray(data)) {
            await this.collection.insertMany(data as Document[]);
        } else {
            await this.collection.insertOne(data as Document);
        }
    }

    async query(filter: Filter = {}, sort: Sort = { [this.options.timeField]: 1 }): Promise<DataRecord[]> {
        return this.collection.find(filter).sort(sort).toArray();
    }

    async aggregateByTimeBucket({
        interval,
        valueField,
        operation = "avg",
        match = {},
    }: AggregateOptions): Promise<DataRecord[]> {
        const mappingForMongo = {
            hours: "hour",
            minutes: "minute",
            days: "day",
        };

        const groupId = {
            $dateTrunc: {
                date: `$${this.options.timeField}`,
                unit: mappingForMongo[interval] || interval,
            },
        };

        const pipeline = [
            { $match: match },
            {
                $group: {
                    _id: groupId,
                    value: { [`$${operation}`]: `$${valueField}` },
                },
            },
            { $sort: { _id: 1 } },
        ];

        return this.collection.aggregate(pipeline).toArray();
    }

    async downsample({
        interval,
        valueField,
        operation = "avg",
        targetCollection,
        match = {},
    }: DownsampleOptions): Promise<DataRecord[]> {
        const results = await this.aggregateByTimeBucket({ interval, valueField, operation, match });
        const target = this.db.collection(targetCollection);

        const exists = await this.db.listCollections({ name: targetCollection }).next();
        if (!exists) {
            await this.db.createCollection(targetCollection, {
                timeseries: {
                    timeField: "timestamp",
                    granularity: interval === "minutes" ? "seconds" : interval,
                },
            });
        }

        const docs: DataRecord[] = results.map((r) => ({
            timestamp: r._id,
            value: r.value,
        }));

        if (docs.length > 0) {
            await target.insertMany(docs as Document[]);
        }

        return docs;
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
