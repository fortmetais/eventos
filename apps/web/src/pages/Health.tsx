import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useOrganization } from "./Organization";
import { useRemote } from "../lib/hooks";
import type { EventEdition, Health as HealthData } from "../lib/types";
import { Empty, Field, Loading, Notice, PageHeading } from "../components/ui";
export function Health() {
  const { organizationId, membership } = useOrganization();
  const events = useRemote<EventEdition[]>(
    `/organizations/${organizationId}/events`,
  );
  const [eventId, setEventId] = useState("");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const people = useRemote<
    {
      id: string;
      protocol: string;
      person: { name: string };
      campaign: { kind: string };
    }[]
  >(
    eventId
      ? `/organizations/${organizationId}/events/${eventId}/health`
      : null,
  );
  const health = useRemote<HealthData>(
    selected
      ? `/organizations/${organizationId}/registrations/${selected}/health`
      : null,
  );
  const searchKey = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
  const filteredPeople = people.data?.filter((person) => searchKey(person.person.name).includes(searchKey(query))) ?? [];
  return (
    <>
      <PageHeading eyebrow="ACESSO RESTRITO" title="Cuidados de saúde">
        Consulte somente informações necessárias para o cuidado dos
        participantes.
      </PageHeading>
      <Notice kind="info">
        As consultas são registradas. Compartilhe informações somente com a
        equipe autorizada.
      </Notice>
      <Field label="Evento autorizado">
        <select
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setSelected("");
            setQuery("");
          }}
        >
          <option value="">Selecione</option>
          {events.data
            ?.filter((e) => membership.healthEventIds.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </Field>
      {people.loading ? (
        <Loading />
      ) : people.error ? (
        <Notice>{people.error}</Notice>
      ) : people.data ? (
        <div className="health-layout">
          <section className="panel">
            <h2>Participantes</h2>
            <Field label="Pesquisar participante">
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome do participante" autoComplete="off" />
            </Field>
            <p className="health-participant-count" role="status">{filteredPeople.length} de {people.data.length} participantes</p>
            {filteredPeople.length ? (
              filteredPeople.map((p) => (
                <button
                  className={`person-button ${selected === p.id ? "selected" : ""}`}
                  key={p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => setSelected(p.id)}
                >
                  <strong>{p.person.name}</strong>
                  <small>
                    {p.campaign.kind === "CAMPER" ? "Campista" : "Servo"} ·{" "}
                    {p.protocol}
                  </small>
                </button>
              ))
            ) : (
              <Empty title={query ? "Nenhum participante encontrado" : "Nenhum participante"}>
                {query && <button type="button" className="text-button" onClick={() => setQuery("")}>Limpar pesquisa</button>}
              </Empty>
            )}
          </section>
          <section className="panel">
            {health.loading ? (
              <Loading />
            ) : health.error ? (
              <Notice>{health.error}</Notice>
            ) : health.data ? (
              <>
                <h2>
                  {people.data.find((p) => p.id === selected)?.person.name}
                </h2>
                {(
                  [
                    ["hasAllergies", "allergies", "Alergias"],
                    ["hasMedication", "medication", "Medicamentos"],
                    ["hasDiet", "diet", "Restrições alimentares"],
                    ["hasCondition", "condition", "Condições de saúde"],
                    ["hasNeeds", "needs", "Apoio e adaptações"],
                  ] as const
                ).map(([flag, detail, label]) => (
                  <div className="health-item" key={flag}>
                    <h3>{label}</h3>
                    <p>
                      {health.data![flag] === undefined ? "Não perguntado" : health.data![flag]
                        ? health.data![detail]
                        : "Não"}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <Empty title="Selecione uma pessoa">
                <ShieldCheck size={20} />
              </Empty>
            )}
          </section>
        </div>
      ) : (
        <Empty title="Escolha um evento autorizado" />
      )}
    </>
  );
}
