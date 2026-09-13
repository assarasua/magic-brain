import { unstable_cache } from "next/cache";
import { query } from "@/lib/db";

export type SetOption = {
  code: string;
  name: string;
  releasedAt: string | null;
  setType: string;
  digital: boolean;
  tabletop: boolean;
  parentSetCode: string | null;
};

type SetRow = {
  code: string;
  name: string;
  released_at: string | null;
  set_type: string;
  digital: boolean;
  tabletop: boolean;
  parent_set_code: string | null;
};

const loadSetOptions = async (): Promise<SetOption[]> => {
  const { rows } = await query<SetRow>(
    `
      select
        code, name, released_at::text, set_type,
        digital, tabletop, parent_set_code
      from app_sets
      order by released_at desc nulls last, name asc
    `,
  );

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    releasedAt: row.released_at,
    setType: row.set_type,
    digital: row.digital,
    tabletop: row.tabletop,
    parentSetCode: row.parent_set_code,
  }));
};

export const getSetOptions = unstable_cache(
  loadSetOptions,
  ["set-options"],
  { revalidate: 3600, tags: ["sets"] },
);
