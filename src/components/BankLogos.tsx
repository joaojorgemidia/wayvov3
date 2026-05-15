import React from "react";
import { Banknote } from "lucide-react";

import bankC6 from "@/assets/bank-c6.png";
import bankNubank from "@/assets/bank-nubank.png";
import bankMercadoPago from "@/assets/bank-mercadopago.png";
import bankInter from "@/assets/bank-inter.png";
import bankItau from "@/assets/bank-itau.png";
import bankBradesco from "@/assets/bank-bradesco.png";
import bankSantander from "@/assets/bank-santander.png";
import bankBB from "@/assets/bank-bb.png";
import bankCaixa from "@/assets/bank-caixa.png";
import bankPan from "@/assets/bank-pan.png";
import bankPicPay from "@/assets/bank-picpay.png";
import bankSicoob from "@/assets/bank-sicoob.png";
import bankAsaas from "@/assets/bank-asaas.png";
import bankPagBank from "@/assets/bank-pagbank.png";

const bankImages: Record<string, string> = {
  C6: bankC6,
  Nubank: bankNubank,
  "Mercado Pago": bankMercadoPago,
  Inter: bankInter,
  Itaú: bankItau,
  Bradesco: bankBradesco,
  Santander: bankSantander,
  "Banco do Brasil": bankBB,
  Caixa: bankCaixa,
  Pan: bankPan,
  PicPay: bankPicPay,
  Sicoob: bankSicoob,
  Asaas: bankAsaas,
  PagBank: bankPagBank,
};

const bankImagePosition: Record<string, React.CSSProperties> = {
  Bradesco: { objectPosition: "center 22%" },
  "Banco do Brasil": { objectPosition: "center 22%" },
  PagBank: { objectPosition: "center 24%" },
};

interface BankIconProps {
  conta: string;
  size?: number;
  className?: string;
}

export function BankIcon({ conta, size = 28, className = "" }: BankIconProps) {
  if (conta === "Dinheiro") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 ${className}`}
        style={{ width: size, height: size }}
      >
        <Banknote style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }

  const imgSrc = bankImages[conta];
  if (imgSrc) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-background ring-1 ring-border/60 ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={imgSrc}
          alt={`Logo ${conta}`}
          loading="lazy"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          style={bankImagePosition[conta]}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-bold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {conta?.charAt(0)?.toUpperCase() || "?"}
    </span>
  );
}
