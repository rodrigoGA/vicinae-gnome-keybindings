import { Action, ActionPanel, Detail, List } from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import { Keybinding, readGnomeKeybindings, renderKeybindingsMarkdown } from "./lib/gnome-keybindings";

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(item: Keybinding, searchText: string): boolean {
  const query = normalizeSearch(searchText);
  if (!query) return true;

  const haystack = normalizeSearch(
    [item.name, item.section, item.bindings.join(" "), item.command ?? "", item.source].join(" "),
  );

  return query.split(" ").every((part) => haystack.includes(part));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function shortcutSubtitle(item: Keybinding): string {
  const binding = item.bindings.join(" / ");
  if (item.command) return `${binding} → ${item.command}`;
  return binding;
}

function shortcutMarkdown(item: Keybinding): string {
  const lines = [
    `# ${item.name}`,
    "",
    `**Atajo:** ${item.bindings.map((binding) => `\`${binding}\``).join(" / ")}`,
    "",
    `**Sección:** ${item.section}`,
    "",
  ];

  if (item.command) {
    lines.push("**Comando:**", "", "```bash", item.command, "```", "");
  }

  lines.push(`**Fuente:** \`${item.source}\``);

  return lines.join("\n");
}

function ErrorDetail({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <Detail
      markdown={[
        "# GNOME Keybindings",
        "",
        "No pude leer los atajos de GNOME.",
        "",
        "```text",
        message,
        "```",
        "",
        "Verificá que `gsettings` funcione desde la misma sesión de usuario:",
        "",
        "```bash",
        "gsettings list-recursively org.gnome.desktop.wm.keybindings",
        "```",
      ].join("\n")}
      actions={
        <ActionPanel>
          <Action title="Recargar" onAction={onReload} />
        </ActionPanel>
      }
    />
  );
}

function ShortcutActions({ item, markdown, onReload }: { item: Keybinding; markdown: string; onReload: () => void }) {
  const binding = item.bindings.join(" / ");

  return (
    <ActionPanel>
      <Action.Push title="Ver Detalle" target={<Detail markdown={shortcutMarkdown(item)} />} />
      <Action.CopyToClipboard title="Copiar Atajo" content={binding} />
      <Action.CopyToClipboard title="Copiar Acción" content={item.name} />
      {item.command ? <Action.CopyToClipboard title="Copiar Comando" content={item.command} /> : null}
      <Action.CopyToClipboard title="Copiar Cheatsheet Completa" content={markdown} />
      <Action title="Recargar" onAction={onReload} />
    </ActionPanel>
  );
}

export default function Command() {
  const [items, setItems] = useState<Keybinding[]>([]);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setIsLoading(true);
    setError(null);

    try {
      const keybindings = await readGnomeKeybindings();
      setItems(keybindings);
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : String(readError);
      setError(message);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, searchText)),
    [items, searchText],
  );

  const sections = useMemo(() => unique(filteredItems.map((item) => item.section)), [filteredItems]);
  const fullMarkdown = useMemo(() => renderKeybindingsMarkdown(items), [items]);

  if (error) {
    return <ErrorDetail message={error} onReload={reload} />;
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Buscar por atajo, acción, comando o sección..."
      onSearchTextChange={setSearchText}
      filtering={false}
    >
      {sections.map((section) => {
        const sectionItems = filteredItems.filter((item) => item.section === section);

        return (
          <List.Section key={section} title={section} subtitle={`${sectionItems.length}`}>
            {sectionItems.map((item) => (
              <List.Item
                key={`${item.section}-${item.source}-${item.bindings.join("|")}`}
                title={item.name}
                subtitle={shortcutSubtitle(item)}
                accessories={[{ text: item.section }]}
                keywords={[item.section, item.source, item.command ?? "", ...item.bindings]}
                actions={<ShortcutActions item={item} markdown={fullMarkdown} onReload={reload} />}
              />
            ))}
          </List.Section>
        );
      })}

      {!isLoading && filteredItems.length === 0 ? (
        <List.EmptyView
          title="Sin resultados"
          description="No encontré atajos que coincidan con esa búsqueda."
          actions={
            <ActionPanel>
              <Action title="Recargar" onAction={reload} />
              <Action.CopyToClipboard title="Copiar Cheatsheet Completa" content={fullMarkdown} />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
