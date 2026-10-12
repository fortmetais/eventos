const shirtSizeGuide = new URL(
  "../assets/shirt-size-guide.webp",
  import.meta.url,
).href;

export function ShirtSizeGuide() {
  return (
    <figure className="shirt-size-guide">
      <a
        href={shirtSizeGuide}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ampliar tabela de medidas da camiseta"
      >
        <img
          src={shirtSizeGuide}
          width={740}
          height={740}
          loading="lazy"
          alt="Medidas da camiseta tradicional, largura × altura em centímetros: PP 47 × 62; P 50 × 66; M 54 × 68; G 56 × 72; GG 60 × 74; XG 66 × 77; XGG 69 × 82; ESP 74 × 86."
        />
      </a>
      <figcaption>
        Medidas em centímetros. Abra a imagem para ampliar.
      </figcaption>
    </figure>
  );
}
