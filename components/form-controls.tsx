"use client";

import {
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextField,
  type Key,
} from "@heroui/react";
import type { ReactNode } from "react";

import type { SizeOption } from "@/lib/models";
import { validateCustomSize } from "@/lib/models";

export interface TechOption {
  value: string;
  label: string;
  note?: string;
}

const TECH_VALUE_RE = /^[A-Za-z0-9._x×:-]+$/;

/** mono 技术值 + 中文注混排 */
function OptionLabel({ label, note }: { label: string; note?: string }) {
  return (
    <>
      {TECH_VALUE_RE.test(label) ? (
        <span className="tech text-[13.5px]">{label}</span>
      ) : (
        <span>{label}</span>
      )}
      {note ? <span>{note}</span> : null}
    </>
  );
}

interface SelectValueRenderProps {
  defaultChildren?: ReactNode;
  isPlaceholder?: boolean;
}

function renderSelectedValue(
  options: TechOption[],
  value: string,
): (props: SelectValueRenderProps) => ReactNode {
  return function SelectedTechValue({ defaultChildren, isPlaceholder }: SelectValueRenderProps) {
    if (isPlaceholder) {
      return defaultChildren;
    }
    const option = options.find((o) => o.value === value);
    return option ? <OptionLabel label={option.label} note={option.note} /> : defaultChildren;
  };
}

interface SizeFieldProps {
  label: string;
  options: SizeOption[];
  value: string;
  onChange: (value: string) => void;
  allowCustom: boolean;
  customValue: string;
  onCustomChange: (value: string) => void;
  isDisabled?: boolean;
}

export function SizeField({
  allowCustom,
  customValue,
  isDisabled,
  label,
  onCustomChange,
  onChange,
  options,
  value,
}: SizeFieldProps) {
  const isCustom = allowCustom && value === "__custom__";
  const customError = isCustom && customValue.trim().length > 0 ? validateCustomSize(customValue) : null;

  return (
    <div className="flex flex-col gap-3">
      <Select
        isDisabled={isDisabled}
        value={value}
        onChange={(key: Key | null) => {
          if (typeof key === "string") {
            onChange(key);
          }
        }}
      >
        <Label className="text-[13px] font-medium text-foreground/80">{label}</Label>
        <Select.Trigger>
          <Select.Value>{renderSelectedValue(options, value)}</Select.Value>
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={`${option.label}${option.note ?? ""}`}
              >
                <OptionLabel label={option.label} note={option.note} />
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {isCustom ? (
        <TextField
          isDisabled={isDisabled}
          isInvalid={customError !== null}
          value={customValue}
          onChange={onCustomChange}
        >
          <Label className="text-[13px] font-medium text-foreground/80">自定义尺寸</Label>
          <Input placeholder="例如 2048x1152" />
          {customError ? <FieldError>{customError}</FieldError> : null}
        </TextField>
      ) : null}
    </div>
  );
}

interface OptionSwitchProps {
  label: string;
  description?: string;
  selected: boolean;
  onChange: (selected: boolean) => void;
  isDisabled?: boolean;
}

export function OptionSwitch({
  description,
  isDisabled,
  label,
  onChange,
  selected,
}: OptionSwitchProps) {
  return (
    <div className="flex flex-col gap-1 rounded-control bg-surface-secondary p-3">
      <Switch isDisabled={isDisabled} isSelected={selected} onChange={onChange}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {label}
        </Switch.Content>
      </Switch>
      {description ? <span className="text-xs leading-relaxed text-muted">{description}</span> : null}
    </div>
  );
}

interface SimpleSelectProps {
  label: string;
  options: TechOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
}

export function SimpleSelect({
  isDisabled,
  label,
  onChange,
  options,
  value,
}: SimpleSelectProps) {
  return (
    <Select
      isDisabled={isDisabled}
      value={value}
      onChange={(key: Key | null) => {
        if (typeof key === "string") {
          onChange(key);
        }
      }}
    >
      <Label className="text-[13px] font-medium text-foreground/80">{label}</Label>
      <Select.Trigger>
        <Select.Value>{renderSelectedValue(options, value)}</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={`${option.label}${option.note ?? ""}`}
            >
              <OptionLabel label={option.label} note={option.note} />
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
