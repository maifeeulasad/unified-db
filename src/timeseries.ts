import type {
  DbEngine,
  Filter,
  Sort,
  DataRecord,
  AggregateOptions,
  DownsampleOptions,
} from "./engine/DbEngine";

export class TimeSeriesDB {
  constructor(private engine: DbEngine) {}

  async connect(): Promise<void> {
    await this.engine.connect();
  }

  async insert(data: DataRecord | DataRecord[]): Promise<void> {
    return this.engine.insert(data);
  }

  async query(filter: Filter = {}, sort: Sort = {}): Promise<DataRecord[]> {
    return this.engine.query(filter, sort);
  }

  async aggregateByTimeBucket(options: AggregateOptions): Promise<DataRecord[]> {
    return this.engine.aggregateByTimeBucket(options);
  }

  async downsample(options: DownsampleOptions): Promise<DataRecord[]> {
    return this.engine.downsample(options);
  }

  async close(): Promise<void> {
    return this.engine.close();
  }
}
