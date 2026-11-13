import { Check, RefreshCw, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AnalysisPhase,
  ExpressionAnalysis,
  ReflectionChoice,
} from "./types/expression";
import { formatConfidence } from "./utils/expressionMapping";

const SELF_MOODS = [
  "Happy",
  "Calm",
  "Neutral",
  "Sad",
  "Anxious",
  "Stressed",
  "Angry",
];

interface ExpressionResultProps {
  analysis: ExpressionAnalysis | null;
  phase: AnalysisPhase;
  reflection: ReflectionChoice;
  selfMood: string;
  onReflectionChange: (choice: ReflectionChoice) => void;
  onSelfMoodChange: (mood: string) => void;
}

export function ExpressionResult({
  analysis,
  phase,
  reflection,
  selfMood,
  onReflectionChange,
  onSelfMoodChange,
}: ExpressionResultProps) {
  if (phase === "low-confidence") {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="text-sm font-medium">
          Unable to determine facial expression with sufficient confidence.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try better lighting, face the camera directly, and make sure only
          your face is in the frame.
        </p>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const topPredictions = analysis.probabilities.slice(0, 3);

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            AI-estimated expression
          </p>
          <p className="text-lg font-semibold">{analysis.label}</p>
        </div>
        <Badge variant={analysis.confidence >= 0.75 ? "default" : "secondary"}>
          {formatConfidence(analysis.confidence)} confidence
        </Badge>
      </div>

      <div className="space-y-2">
        {topPredictions.map((prediction) => (
          <div key={prediction.key} className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{prediction.label}</span>
              <span>{formatConfidence(prediction.confidence)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.round(prediction.confidence * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-sm font-medium">
          Does this match how you feel right now?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={reflection === "matches" ? "default" : "outline"}
            onClick={() => onReflectionChange("matches")}
          >
            <Check className="mr-1 h-4 w-4" />
            Yes, this matches
          </Button>
          <Button
            size="sm"
            variant={reflection === "different" ? "default" : "outline"}
            onClick={() => onReflectionChange("different")}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            No, choose my mood
          </Button>
          <Button
            size="sm"
            variant={reflection === "skipped" ? "default" : "outline"}
            onClick={() => onReflectionChange("skipped")}
          >
            <SkipForward className="mr-1 h-4 w-4" />
            Skip
          </Button>
        </div>

        {reflection === "different" && (
          <div className="space-y-2 pt-1">
            <label
              htmlFor="self-mood"
              className="text-xs font-medium text-muted-foreground"
            >
              Your actual mood
            </label>
            <select
              id="self-mood"
              value={selfMood}
              onChange={(event) => onSelfMoodChange(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select your mood</option>
              {SELF_MOODS.map((mood) => (
                <option key={mood} value={mood}>
                  {mood}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              This selection is not saved.
            </p>
          </div>
        )}

        {reflection === "matches" && (
          <p className="text-xs text-muted-foreground">
            Thanks for confirming. This check-in is not saved.
          </p>
        )}

        {reflection === "skipped" && (
          <p className="text-xs text-muted-foreground">
            No problem — you can skip the reflection.
          </p>
        )}
      </div>
    </div>
  );
}
