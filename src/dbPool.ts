import { AsyncLocalStorage } from "async_hooks";
import pg from "pg";
import { SQLStatement } from "sql-template-strings";

type SqlLike = SQLStatement | string;

export class DbPool {
    private readonly asyncLocalStorage: AsyncLocalStorage<pg.PoolClient>;
    private readonly pool: pg.Pool;

    public constructor(config?: pg.PoolConfig) {
        this.asyncLocalStorage = new AsyncLocalStorage();
        pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
        pg.types.setTypeParser(pg.types.builtins.INT8, (value) =>
            parseInt(value, 10),
        );
        this.pool = new pg.Pool(config);
    }

    public async executeQuery<T extends pg.QueryResultRow>(
        statement: SqlLike,
    ): Promise<pg.QueryResult<T>> {
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
