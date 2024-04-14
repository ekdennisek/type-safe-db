import { AsyncLocalStorage } from "async_hooks";
import {
    Pool,
    PoolClient,
    PoolConfig,
    QueryResult,
    QueryResultRow,
    types,
} from "pg";
import { SQLStatement } from "sql-template-strings";

type SqlLike = SQLStatement | string;

export class DbPool {
    private readonly asyncLocalStorage: AsyncLocalStorage<PoolClient>;
    private readonly pool: Pool;

    public constructor(config?: PoolConfig) {
        this.asyncLocalStorage = new AsyncLocalStorage();
        types.setTypeParser(types.builtins.DATE, (value) => value);
        types.setTypeParser(types.builtins.INT8, (value) =>
            parseInt(value, 10),
        );
        this.pool = new Pool(config);
    }

    public async executeQuery<T extends QueryResultRow>(
        statement: SqlLike,
    ): Promise<QueryResult<T>> {
        let client = this.asyncLocalStorage.getStore();
        const shouldReleaseClient = client === undefined;
        if (!client) {
            client = await this.pool.connect();
        }

        try {
            return client.query<T>(statement);
        } finally {
            if (shouldReleaseClient) {
                client.release();
            }
        }
    }

    public async transaction<T>(callback: () => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        await client.query("BEGIN");
        try {
            return this.asyncLocalStorage.run(client, async () => {
                const result = await callback();
                await client.query("COMMIT");
                return result;
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}
