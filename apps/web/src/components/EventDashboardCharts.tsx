import { useId } from "react";
import { Link } from "react-router-dom";
import {
  statusLabels,
  type EventRegistrationCounts,
  type EventRegistrationSummary,
  type RegistrationStatus,
} from "../lib/types";

const states: RegistrationStatus[] = [
  "RECEIVED",
  "REVIEW",
  "WAITLIST",
  "APPROVED",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
];
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
type Department = NonNullable<EventRegistrationSummary["departments"]>[number];

function DepartmentOccupancy({
  department,
  campaignId,
  registrationsLink,
  descriptionId,
}: {
  department: Department;
  campaignId: string;
  registrationsLink: (filters: Record<string, string>) => string;
  descriptionId: string;
}) {
  const { capacity, occupied, available } = department;
  const selected = campaignId
    ? (department.occupiedByCampaign[campaignId] ?? 0)
    : occupied;
  const other = Math.max(0, occupied - selected);
  const free = available ?? 0;
  const scale = Math.max(capacity ?? 0, occupied, selected + other + free, 1);
  const excess = capacity == null ? 0 : Math.max(0, occupied - capacity);
  return (
    <Link
      className="event-dashboard-chart-row"
      to={registrationsLink({
        team: department.id,
        sort: "ACCEPTED_FIRST",
        includeClosed: "true",
      })}
      aria-label={`Ver inscrições de ${department.name}`}
      aria-describedby={descriptionId}
    >
      <span className="event-dashboard-chart-name">{department.name}</span>
      <span className="event-dashboard-department-values" id={descriptionId}>
        <span>
          {capacity == null
            ? `${occupied} ocupadas · Vagas não definidas`
            : `${occupied} de ${capacity} vagas ocupadas`}
        </span>
        {campaignId && (
          <>
            <span> · {selected} nesta campanha</span>
            <span> · {other} de outras campanhas</span>
          </>
        )}
        {capacity != null && (
          <span>
            {" · "}
            {available == null
              ? "Disponibilidade não informada"
              : `${available} livres`}
          </span>
        )}
        {excess > 0 && (
          <span className="event-dashboard-capacity-excess">
            {" · "}
            {excess} acima da capacidade
          </span>
        )}
      </span>
      <span
        className={`event-dashboard-chart-track${capacity == null ? " capacity-unknown" : ""}`}
        aria-hidden="true"
      >
        {capacity != null && (
          <>
            <span
              className="occupancy-selected"
              style={{ width: `${(selected / scale) * 100}%` }}
            />
            {campaignId && (
              <span
                className="occupancy-other"
                style={{ width: `${(other / scale) * 100}%` }}
              />
            )}
            <span
              className="occupancy-free"
              style={{ width: `${(free / scale) * 100}%` }}
            />
          </>
        )}
      </span>
    </Link>
  );
}

export function EventDashboardCharts({
  counts,
  summary,
  campaignId,
  registrationsLink,
}: {
  counts: EventRegistrationCounts;
  summary: EventRegistrationSummary;
  campaignId: string;
  registrationsLink: (filters: Record<string, string>) => string;
}) {
  const id = useId();
  const departmentsAvailable =
    summary.departmentsAvailable === true && Array.isArray(summary.departments);
  return (
    <div className="event-dashboard-charts">
      <section
        className="event-dashboard-chart"
        aria-labelledby={`${id}-status`}
      >
        <h2 id={`${id}-status`}>Situação das inscrições</h2>
        <div className="event-dashboard-chart-rows">
          {states.map((status) => {
            const count = counts.byStatus[status];
            const share = counts.total > 0 ? count / counts.total : 0;
            const descriptionId = `${id}-${status}-percent`;
            return (
              <Link
                key={status}
                className="event-dashboard-chart-row"
                to={registrationsLink({
                  status,
                  ...(["REJECTED", "CANCELLED"].includes(status)
                    ? { includeClosed: "true" }
                    : {}),
                })}
                aria-label={`${statusLabels[status]}: ${count} ${count === 1 ? "inscrição" : "inscrições"}. Ver inscrições`}
                aria-describedby={descriptionId}
              >
                <span className="event-dashboard-status-values">
                  <span>{statusLabels[status]}</span>
                  <strong>{count}</strong>
                  <small id={descriptionId}>
                    {percent.format(share)} do total
                  </small>
                </span>
                <span
                  className="event-dashboard-chart-track"
                  aria-hidden="true"
                >
                  <span
                    className={`status-fill chart-status-${status.toLowerCase()}`}
                    style={{
                      width: `${Math.max(0, Math.min(share, 1)) * 100}%`,
                    }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      <section
        className="event-dashboard-chart"
        aria-labelledby={`${id}-departments`}
      >
        <h2 id={`${id}-departments`}>Ocupação dos departamentos</h2>
        {!departmentsAvailable ? (
          <p className="event-dashboard-chart-note">
            Dados dos departamentos indisponíveis.
          </p>
        ) : !summary.departments!.length ? (
          <p className="event-dashboard-chart-note">
            Nenhum departamento cadastrado para este evento.
          </p>
        ) : (
          <>
            <p className="event-dashboard-chart-note">
              Vagas ocupadas por aceitos/confirmados. Clique para ver inscrições
              do departamento.
              {campaignId && " Capacidade compartilhada entre as campanhas."}
            </p>
            <div className="event-dashboard-chart-rows">
              {summary.departments!.map((department, index) => (
                <DepartmentOccupancy
                  key={department.id}
                  department={department}
                  campaignId={campaignId}
                  registrationsLink={registrationsLink}
                  descriptionId={`${id}-department-${index}`}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
