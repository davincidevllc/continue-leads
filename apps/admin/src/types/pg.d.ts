declare module 'pg' {
  interface PoolConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: boolean | { rejectUnauthorized?: boolean };
  }
  interface QueryResult {
    rows: any[];
    rowCount: number;
  }
  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, params?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
