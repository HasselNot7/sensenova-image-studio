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

import { CUSTOM_SIZE_VALUE, type SizeOption } from "@/lib/models";

export interface TechOption {
  value: string;
  label: string;
  note?: string;
}

const TECH_VALUE_RE = /^[A-Za-z0-9._x×*:-]+$/;

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
    const option = options.find((item) => item.value === value);
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
  /** 该模型的自定义尺寸规则（各家写法与像素带都不同，别拿千问那套去量别家） */
  validateCustom: (size: string) => string | null;
  /** 自定义尺寸的写法：千问 `2048*1152`，OpenAI / SenseNova `2048x1152` */
  sizeSeparator: "*" | "x";
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
  sizeSeparator,
  validateCustom,
  value,
}: SizeFieldProps) {
  const isCustom = allowCustom && value === CUSTOM_SIZE_VALUE;
  const customError =
    isCustom && customValue.trim().length > 0 ? validateCustom(customValue) : null;

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
          <Input placeholder={`例如 2048${sizeSeparator}1152`} />
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
    <div className="flex min-h-[56px] flex-col justify-center gap-1 rounded-control bg-surface-secondary px-3 py-2">
      <Switch isDisabled={isDisabled} isSelected={selected} onChange={onChange}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {label}
        </Switch.Content>
      </Switch>
      {description ? (
        <span className="text-xs leading-relaxed text-muted">{description}</span>
      ) : null}
    </div>
  );
}

interface SimpleSelectProps {
  /** 可省：省掉后触发器就是纯下拉框 */
  label?: string;
  options: TechOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  className?: string;
}

export function SimpleSelect({
  className,
  isDisabled,
  label,
  onChange,
  options,
  value,
}: SimpleSelectProps) {
  return (
    <Select
      className={className}
      isDisabled={isDisabled}
      value={value}
      onChange={(key: Key | null) => {
        if (typeof key === "string") {
          onChange(key);
        }
      }}
    >
      {label ? <Label className="text-[13px] font-medium text-foreground/80">{label}</Label> : null}
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
