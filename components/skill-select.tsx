"use client";

import { Chip, Label, ListBox, Select, type Key } from "@heroui/react";

import { measureTextBudget } from "@/lib/prompt-budget";
import { NO_SKILL, NO_SKILL_ID } from "@/lib/skills";
import type { SkillDefinition } from "@/lib/skill-types";

interface SkillSelectProps {
  skills: SkillDefinition[];
  value: string;
  onChange: (id: string) => void;
  tokenLimit: number | null;
  limitUnit?: "tokens" | "chars";
  isDisabled?: boolean;
}

export function SkillSelect({ isDisabled, limitUnit = "tokens", onChange, skills, tokenLimit, value }: SkillSelectProps) {
  const selected = value === NO_SKILL_ID ? NO_SKILL : skills.find((skill) => skill.id === value);

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
      <Label className="text-[13px] font-medium text-foreground/80">
        Skill（{skills.length} 个内置）
      </Label>
      <Select.Trigger>
        <Select.Value>
          {() => (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[13.5px] font-medium">{selected?.name ?? value}</span>
              <span className="tech truncate text-[11.5px] text-muted">{selected?.nameEn}</span>
            </span>
          )}
        </Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {skills.map((skill) => {
            const budget = measureTextBudget(skill.body);
            const usage = limitUnit === "chars" ? budget.chars : budget.tokens;
            const over = tokenLimit !== null && usage > tokenLimit;
            return (
              <ListBox.Item key={skill.id} id={skill.id} textValue={`${skill.name} ${skill.nameEn}`}>
                <div className="flex min-w-0 flex-col gap-1 py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium">{skill.name}</span>
                    <span className="tech truncate text-[11px] text-muted">{skill.nameEn}</span>
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-snug text-muted">
                    {skill.shortDescription}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip color={over ? "warning" : "success"} size="sm" variant="soft">
                      {tokenLimit === null
                        ? limitUnit === "chars"
                          ? `正文 ${usage} 字符`
                          : `估算 ${usage} token`
                        : limitUnit === "chars"
                          ? `正文 ${usage} / ${tokenLimit} 字符`
                          : `估算 ${usage} / ${tokenLimit} token`}
                    </Chip>
                    <span className="text-[11px] text-muted">
                      {skill.mode === "i2i" ? `图生图 · 需 ${skill.inputImages.min} 张照片` : "文生图"} · {skill.author}
                    </span>
                  </div>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
          <ListBox.Item key={NO_SKILL_ID} id={NO_SKILL_ID} textValue={`${NO_SKILL.name} ${NO_SKILL.nameEn}`}>
            <div className="flex min-w-0 flex-col gap-1 py-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium">{NO_SKILL.name}</span>
                <span className="tech truncate text-[11px] text-muted">{NO_SKILL.nameEn}</span>
              </div>
              <p className="line-clamp-2 text-[12px] leading-snug text-muted">
                {NO_SKILL.shortDescription}
              </p>
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
