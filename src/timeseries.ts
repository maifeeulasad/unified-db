import { MongoClient, Db, Collection, Document } from "mongodb";

export interface TimeSeriesOptions {
  dbName: string;
  collectionName: string;
  uri: string;
  timeField: string; // The field that holds the timestamp
  metaField?: string; // Optional: metadata field
  granularity?: "seconds" | "minutes" | "hours";
}

export class TimeSeriesDB {
  private client: MongoClient;
  private db: Db;
  private collection!: Collection;

  constructor(private options: TimeSeriesOptions) {
    this.client = new MongoClient(options.uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.options.dbName);

    const existing = await this.db
      .listCollections({ name: this.options.collectionName })
      .next();

    if (!existing) {
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

  async insert(data: Document | Document[]): Promise<void> {
    if (Array.isArray(data)) {
      await this.collection.insertMany(data);
    } else {
      await this.collection.insertOne(data);
    }
  }

  async query(filter: Document = {}, sort: Document = { [this.options.timeField]: 1 }) {
    return this.collection.find(filter).sort(sort).toArray();
  }

  async aggregateByTimeBucket({
    interval,
    valueField,
    operation = "avg",
    match = {},
  }: {
    interval: "seconds" | "minutes" | "hours";
    valueField: string;
    operation?: "avg" | "min" | "max" | "sum";
    match?: Document;
  }) {
    const mappingForMongoTimeInternal = {
      "hours": "hour",
      "minutes": "minute",
      "days": "day",
    };
    const intervalForAggregation = mappingForMongoTimeInternal[interval] || interval;
    const groupId = {
      $dateTrunc: {
        date: `$${this.options.timeField}`,
        unit: intervalForAggregation,
      },
    };

    const aggregationStage = {
      $group: {
        _id: groupId,
        value: {
          [`$${operation}`]: `$${valueField}`,
        },
      },
    };

    const pipeline = [{ $match: match }, aggregationStage, { $sort: { _id: 1 } }];

    return this.collection.aggregate(pipeline).toArray();
  }

  async downsample({
    interval,
    valueField,
    operation = "avg",
    targetCollection,
    match = {},
  }: {
    interval: "seconds" | "minutes" | "hours";
    valueField: string;
    operation?: "avg" | "min" | "max" | "sum";
    targetCollection: string;
    match?: Document;
  }) {
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

    const docs = results.map((r) => ({
      timestamp: r._id,
      value: r.value,
    }));

    if (docs.length > 0) {
      await target.insertMany(docs);
    }

    return docs;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
