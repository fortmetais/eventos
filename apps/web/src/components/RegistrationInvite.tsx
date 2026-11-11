import { DecisionNotice } from "./DecisionNotice";

export function RegistrationInvite({
  organizationId,
  registrationId,
  onChanged,
  initialWhatsApp = false,
}: {
  organizationId: string;
  registrationId: string;
  onChanged: () => void;
  onClose?: () => void;
  initialWhatsApp?: boolean;
}) {
  return (
    <div className="registration-invite">
      <p>
        O convite é pessoal. Abrir a conversa prepara a mensagem; depois de
        enviá-la, registre o envio aqui.
      </p>
      <DecisionNotice
        organizationId={organizationId}
        registrationId={registrationId}
        onChanged={onChanged}
        initialWhatsApp={initialWhatsApp}
      />
    </div>
  );
}
