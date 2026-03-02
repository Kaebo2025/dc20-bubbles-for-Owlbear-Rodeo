import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { InputName } from "@/statInputHelpers";
import { InputHTMLAttributes } from "react";

export default function StatStyledInput({
  name,
  inputProps,
}: {
  name: InputName;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Input
          {...inputProps}
          name={name}
          className={cn(
            "h-[32px]",
            "w-[60px]",
            {
              // HP / Max HP
              "bg-stat-red/10 dark:bg-stat-red-dark/5":
                name === "hp" || name === "maxHp",

              // Temp HP
              "bg-stat-yellow/10 dark:bg-stat-yellow-dark/5": name === "tempHp",

              // PD
              "bg-stat-blue/10 dark:bg-stat-blue-dark/5": name === "pd",

              // AD
              "bg-stat-green/10 dark:bg-stat-green-dark/5": name === "ad",
            },
            inputProps?.className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent>
        <p>{nameToLabel(name)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const nameToLabel = (name: InputName) => {
  switch (name) {
    case "hp":
      return "HP";
    case "maxHp":
      return "Max HP";
    case "tempHp":
      return "Temp HP";
    case "pd":
      return "PD";
    case "ad":
      return "AD";
    case "hideStats":
      return "Hide Stats";
  }
};
