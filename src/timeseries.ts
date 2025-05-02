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

  async close(): Promise<void> {
    await this.client.close();
  }
}
