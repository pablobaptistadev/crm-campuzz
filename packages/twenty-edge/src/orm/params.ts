// Named parameters keep the generated SQL readable while still being bound, then
// compile down to $1..$n for node-postgres.
export type ParameterBag = {
  add: (value: unknown) => string;
  compile: (sql: string) => { text: string; values: unknown[] };
};

export const createParameterBag = (): ParameterBag => {
  const valueByName = new Map<string, unknown>();
  let counter = 0;

  return {
    add: (value) => {
      counter += 1;
      const name = `p${counter}`;

      valueByName.set(name, value);

      return `:${name}`;
    },
    compile: (sql) => {
      const values: unknown[] = [];
      const indexByName = new Map<string, number>();

      const text = sql.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, (match, name) => {
        if (!valueByName.has(name)) {
          return match;
        }

        const existingIndex = indexByName.get(name);

        if (existingIndex !== undefined) {
          return `$${existingIndex}`;
        }

        values.push(valueByName.get(name));
        indexByName.set(name, values.length);

        return `$${values.length}`;
      });

      return { text, values };
    },
  };
};
