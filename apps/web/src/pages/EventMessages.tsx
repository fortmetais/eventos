import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import { api } from "../lib/api";
import type { EventEdition } from "../lib/types";
import { Field, Loading, Notice, PageHeading } from "../components/ui";

type MessageSettings = {
  ready: boolean;
  event: { id: string; name: string };
  revision: number;
  template: string;
  defaultTemplate: string;
  customized: boolean;
  fields: { key: string; label: string; example: string }[];
  previewValues: Record<string, string>;
};
export function EventMessages() {
  const { organizationId, membership } = useOrganization();
  const [params, setParams] = useSearchParams();
  const [eventId, setEventId] = useState(params.get("evento") ?? "");
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  if (membership.role !== "ORGANIZER")
    return (
      <Notice>A personalização de mensagens é restrita ao organizador.</Notice>
    );
  return (
    <>
      <PageHeading title="Mensagens do evento">
        Personalize a mensagem de aceite dos servos e confira como ficará antes
        de compartilhar.
      </PageHeading>
      <section className="panel">
        <Field label="Evento">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setParams(e.target.value ? { evento: e.target.value } : {}, {
                replace: true,
              });
            }}
          >
            <option value="">Selecione um evento</option>
            {events.data?.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </Field>
        {events.loading && <Loading />}
        {events.error && <Notice>{events.error}</Notice>}
      </section>
      {eventId && (
        <MessageEditor
          key={eventId}
          organizationId={organizationId}
          eventId={eventId}
        />
      )}
    </>
  );
}
function MessageEditor({
  organizationId,
  eventId,
}: {
  organizationId: string;
  eventId: string;
}) {
  const path = `/organizations/${organizationId}/events/${eventId}/accept-message`;
  const remote = useRemote<MessageSettings>(path);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (remote.data) setText(remote.data.template);
  }, [remote.data]);
  const data = remote.data;
  if (remote.loading) return <Loading />;
  if (remote.error) return <Notice>{remote.error}</Notice>;
  if (!data) return null;
  function insert(key: string) {
    const input = editor.current;
    const start = input?.selectionStart ?? text.length,
      end = input?.selectionEnd ?? text.length;
    const variable = `{{${key}}}`;
    setText(text.slice(0, start) + variable + text.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + variable.length,
        start + variable.length,
      );
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const updated = await api<MessageSettings>(path, {
        method: "PUT",
        body: {
          revision: data!.revision,
          template: text === data!.defaultTemplate ? null : text,
        },
      });
      remote.setData(updated);
      setInfo("Mensagem salva para este evento. Nenhuma mensagem foi enviada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const preview = text.replace(
    /\{\{\s*([\w]+)\s*\}\}/g,
    (original, key: string) => data.previewValues[key] ?? original,
  );
  return (
    <section className="panel">
      <h2>Aceite para servir · {data.event.name}</h2>
      {!data.ready && (
        <Notice>
          A personalização das mensagens aguarda a atualização 17 do banco. Você
          pode consultar o texto padrão.
        </Notice>
      )}
      {error && (
        <Notice>
          {error}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={remote.refresh}
          >
            Recarregar modelo salvo
          </button>
        </Notice>
      )}
      {info && <Notice kind="success">{info}</Notice>}
      <p>
        Use os botões para inserir as informações de cada candidato. Mantenha
        nome, evento, link pessoal e validade. O departamento será o
        efetivamente alocado; sem alocação, aparecerá “A definir pela
        organização”.
      </p>
      <div className="message-editor">
        <div>
          <div
            className="button-row"
            aria-label="Inserir informações automáticas"
          >
            {data.fields.map((field) => (
              <button
                key={field.key}
                type="button"
                className="button outline"
                disabled={busy || !data.ready}
                onClick={() => insert(field.key)}
              >
                Inserir {field.label.toLocaleLowerCase("pt-BR")}
              </button>
            ))}
          </div>
          <Field
            label="Texto da mensagem"
            hint="Até 5.000 caracteres. Use texto simples e quebras de linha; o mesmo texto é usado no WhatsApp e no e-mail."
          >
            <textarea
              ref={editor}
              rows={18}
              maxLength={5000}
              value={text}
              disabled={busy || !data.ready}
              onChange={(e) => {
                setText(e.target.value);
                setInfo("");
              }}
            />
          </Field>
          <small>{text.length}/5.000 caracteres</small>
          <div className="button-row">
            <button
              className="button primary"
              disabled={
                busy ||
                !data.ready ||
                text === data.template ||
                text.trim().length < 20
              }
              onClick={() => void save()}
            >
              {busy ? "Salvando…" : "Salvar mensagem"}
            </button>
            <button
              className="button outline"
              disabled={busy || !data.ready}
              onClick={() => {
                setText(data.defaultTemplate);
                setInfo(
                  "Texto padrão carregado na edição. Salve para aplicar ao evento.",
                );
              }}
            >
              Restaurar texto padrão
            </button>
          </div>
          <p className="muted">
            Salvar o modelo não envia mensagens nem modifica candidaturas.
            Mensagens já enviadas permanecem com o conteúdo original.
          </p>
        </div>
        <section className="previous-review" aria-label="Prévia da mensagem">
          <h3>Prévia com dados fictícios</h3>
          <p className="message-preview">{preview}</p>
        </section>
      </div>
    </section>
  );
}
