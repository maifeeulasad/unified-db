export type Filter = Record<string, unknown>;
export type Sort = Record<string, 1 | -1>;
export type DataRecord = Record<string, unknown>;

export interface AggregateOptions {
  interval: "seconds" | "minutes" | "hours";
  valueField: string;
  operation?: "avg" | "min" | "max" | "sum";
  match?: Filter;
}

export interface DownsampleOptions extends AggregateOptions {
  targetCollection: string;
}

export abstract class DbEngine {
  abstract connect(): Promise<void>;
  abstract insert(data: DataRecord | DataRecord[]): Promise<void>;
  abstract query(filter?: Filter, sort?: Sort): Promise<DataRecord[]>;
  abstract aggregateByTimeBucket(options: AggregateOptions): Promise<DataRecord[]>;
  abstract downsample(options: DownsampleOptions): Promise<DataRecord[]>;
  abstract close(): Promise<void>;
}
