// Receita Federal: os 12 primeiros caracteres podem conter letras; os dois DVs
// seguem módulo 11, com cada caractere convertido pelo código ASCII menos 48.
// https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj
export function normalizeCnpj(value: string) {
  return value.trim().toUpperCase().replace(/[./-]/g, "");
}
export function validCnpj(value: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(\d)\1{13}$/.test(value))
    return false;
  const digit = (base: string) => {
    let weight = base.length - 7;
    const sum = [...base].reduce((total, char) => {
      const next = total + (char.charCodeAt(0) - 48) * weight;
      weight = weight === 2 ? 9 : weight - 1;
      return next;
    }, 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  return (
    value[12] === digit(value.slice(0, 12)) &&
    value[13] === digit(value.slice(0, 13))
  );
}
