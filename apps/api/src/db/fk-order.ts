import type { Sql } from './index.js';

// Ordre d'insertion sûr : une table n'est insérée qu'après les tables vers
// lesquelles elle porte une clé étrangère (les « parents » d'abord).
// Construit à partir des contraintes réellement présentes dans la base cible,
// donc robuste à l'ajout de futures tables.
export async function fkInsertionOrder(db: Sql, names: string[]): Promise<string[]> {
  const fks = await db.query<{ src: string; dst: string }>(
    `SELECT cl.relname AS src, confrelid::regclass::text AS dst
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE c.contype = 'f' AND cl.relnamespace = 'public'::regnamespace`,
  );
  const dependOn = new Map<string, string[]>();
  for (const { src, dst } of fks) {
    const target = dst.replace(/^"public"\./, '').replace(/"/g, '');
    if (!names.includes(src) || !names.includes(target)) continue;
    dependOn.set(src, [...(dependOn.get(src) ?? []), target]);
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string, stack: Set<string>): void => {
    if (seen.has(name) || stack.has(name)) return;
    stack.add(name);
    for (const dep of dependOn.get(name) ?? []) visit(dep, stack);
    stack.delete(name);
    seen.add(name);
    ordered.push(name);
  };
  for (const n of names) visit(n, new Set());
  return ordered;
}
