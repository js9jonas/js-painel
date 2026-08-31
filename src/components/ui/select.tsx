"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type SelectOption = {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

type SelectProps = {
  // Controlado (value+onChange) — modo padrão, usado na maioria dos formulários.
  value?: string
  onChange?: (value: string) => void
  // Não-controlado (defaultValue+name) — pra selects dentro de <form method="GET">
  // que dependem de submissão nativa do navegador (ex: filtro de listagem).
  // Nesse modo o Radix cria um <select> nativo oculto espelhando o valor, então
  // FormData/GET continuam funcionando igual ao <select> nativo original.
  defaultValue?: string
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  autoFocus?: boolean
  onBlur?: React.FocusEventHandler<HTMLButtonElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>
}

// Radix não aceita SelectItem com value="" (lança erro em runtime) — usamos um
// sentinela interno pra manter a mesma convenção do <select> nativo usada no
// resto do app, onde value="" representa "nenhum selecionado"/"— Nenhum —".
// A troca sentinela↔"" acontece só aqui dentro, o call site nunca vê isso.
const VAZIO = "__vazio__"

/**
 * Substituto do <select> nativo com o mesmo modelo de clique-clique em
 * qualquer SO (o <select> nativo no Linux/Chrome usa o modelo GTK de
 * clicar-e-arrastar, que fecha e "seleciona" no mouseup de um clique rápido —
 * ver docs/memoria/incident_select_nativo_linux_click_drag.md).
 */
export function Select({
  value,
  onChange,
  defaultValue,
  options,
  placeholder,
  className,
  disabled,
  id,
  name,
  autoFocus,
  onBlur,
  onKeyDown,
}: SelectProps) {
  const controlado = value !== undefined;
  const rootProps = controlado
    ? { value: value === "" ? VAZIO : value, onValueChange: (v: string) => onChange?.(v === VAZIO ? "" : v) }
    : { defaultValue: defaultValue === "" || defaultValue === undefined ? VAZIO : defaultValue };

  return (
    <SelectPrimitive.Root
      {...rootProps}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cn(
          // inline-flex (não flex) pra igualar o auto-width do <select> nativo por
          // padrão — só estica quando o className do call site pede w-full/flex-1
          // explicitamente (é o que a maioria dos formulários já faz).
          "inline-flex items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-left text-sm outline-none transition-all",
          "focus:border-transparent focus:ring-2 focus:ring-zinc-900",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[placeholder]:text-zinc-400",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
        >
          <SelectPrimitive.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value === "" ? VAZIO : opt.value}
                disabled={opt.disabled}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm text-zinc-700 outline-none",
                  "data-[highlighted]:bg-zinc-100",
                  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                )}
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
