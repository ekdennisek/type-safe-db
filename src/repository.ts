import { SQLStatement } from "sql-template-strings";
import { DbPool } from "./dbPool";
import { QueryResultRow } from "pg";
import { z } from "zod";

export class Repository {
    public constructor(private readonly dbPool: DbPool) {}

    protected async tx<T>(callback: () => Promise<T>): Promise<T> {
        return this.dbPool.transaction<T>(async () => {
            return callback();
        });
    }

    protected async any<T extends QueryResultRow>(
        statement: SQLStatement,
        schema: z.ZodType<T>,
    ): Promise<T[]> {
        return this.query<T>(statement, schema);
    }

    protected async one<T extends QueryResultRow>(
        statement: SQLStatement,
        schema: z.ZodType<T>,
    ): Promise<T> {
        const rows = await this.query<T>(statement, schema);
        if (rows.length !== 1 || !rows[0]) {
            throw new Error(`Expected 1 row but got ${rows.length}`);
        }
        return rows[0];
    }

    protected async oneOrNone<T extends QueryResultRow>(
        statement: SQLStatement,
        schema: z.ZodType<T>,
    ): Promise<T | undefined> {
        const rows = await this.query<T>(statement, schema);
        if (rows.length === 0) {
            return undefined;
        } else if (rows.length === 1 && rows[0]) {
            return rows[0];
        }
        throw new Error(`Expected 0 or 1 row but got ${rows.length}`);
    }

    protected async none(statement: SQLStatement): Promise<unknown> {
        return this.query(statement);
    }

    protected async query<T extends QueryResultRow>(
        statement: SQLStatement,
        schema?: z.ZodType<T>,
    ): Promise<T[]> {
        const { rows } = await this.dbPool.executeQuery<T>(statement);
        if (!schema) return rows;

        return z.array(schema).parse(rows);
    }
}
