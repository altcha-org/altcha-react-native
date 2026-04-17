import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  createBenchmarkChallenge,
  solveChallengeWorkers,
  hasScryptSupport,
  hasArgon2Support,
} from '../../src/pow';
import type { AltchaTheme } from '../../src/theme';

// ---------------------------------------------------------------------------
// Benchmark configurations — match Flutter example for cross-platform comparison
// ---------------------------------------------------------------------------

type Config = {
  label: string;
  algorithm: string;
  cost: number;
  counter: number;
  memoryCost?: number;
  parallelism?: number;
  requiresArgon2?: boolean;
  requiresScrypt?: boolean;
};

const CONFIGS: Config[] = [
  {
    label: 'PBKDF2/SHA-256',
    algorithm: 'PBKDF2/SHA-256',
    cost: 5000,
    counter: 5000,
  },
  { label: 'SHA-256', algorithm: 'SHA-256', cost: 1000, counter: 100 },
  {
    label: 'Argon2id',
    algorithm: 'ARGON2ID',
    cost: 2,
    memoryCost: 32768,
    parallelism: 1,
    counter: 100,
    requiresArgon2: true,
  },
  {
    label: 'Scrypt',
    algorithm: 'SCRYPT',
    cost: 32768,
    memoryCost: 8,
    parallelism: 1,
    counter: 100,
    requiresScrypt: true,
  },
];

// ---------------------------------------------------------------------------
// Result model
// ---------------------------------------------------------------------------

type BenchmarkResult = {
  label: string;
  algorithm: string;
  cost: number;
  memoryCost?: number;
  counter: number | null;
  timeMs: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  theme: AltchaTheme;
  onBack: () => void;
};

export function BenchmarkScreen({ theme, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [workers, setWorkers] = useState(1);
  const [workersInput, setWorkersInput] = useState('1');

  async function runAll() {
    setRunning(true);
    setResults([]);
    setCurrentLabel(null);

    for (const config of CONFIGS) {
      setCurrentLabel(config.label);
      const result = await runOne(config);
      setResults((prev) => [...prev, result]);
    }

    setRunning(false);
    setCurrentLabel(null);
  }

  async function runOne(config: Config): Promise<BenchmarkResult> {
    if (config.requiresArgon2 && !hasArgon2Support()) {
      return {
        label: config.label,
        algorithm: config.algorithm,
        cost: config.cost,
        counter: null,
        timeMs: 0,
        error: 'Requires react-native-quick-crypto',
      };
    }
    if (config.requiresScrypt && !hasScryptSupport()) {
      return {
        label: config.label,
        algorithm: config.algorithm,
        cost: config.cost,
        counter: null,
        timeMs: 0,
        error: 'Requires react-native-quick-crypto',
      };
    }
    try {
      const challenge = await createBenchmarkChallenge(
        config.algorithm,
        config.cost,
        config.counter,
        32,
        config.memoryCost,
        config.parallelism
      );
      const start = Date.now();
      const solution = await solveChallengeWorkers(challenge, workers);
      const timeMs = Math.round(Date.now() - start);
      return {
        label: config.label,
        algorithm: config.algorithm,
        cost: config.cost,
        memoryCost: config.memoryCost,
        counter: solution?.counter ?? null,
        timeMs,
        error: solution == null ? 'timed out' : undefined,
      };
    } catch (e: unknown) {
      return {
        label: config.label,
        algorithm: config.algorithm,
        cost: config.cost,
        counter: null,
        timeMs: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundColor }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.backText, { color: theme.primaryColor }]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textColor }]}>
          Benchmark
        </Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.body}>
        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.runButton,
              { backgroundColor: theme.primaryColor },
              running && styles.runButtonDisabled,
            ]}
            onPress={runAll}
            disabled={running}
          >
            <Text
              style={[
                styles.runButtonText,
                { color: theme.primaryContentColor },
              ]}
            >
              {running ? 'Running…' : 'Run'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Workers input */}
        <View style={styles.workersRow}>
          <Text style={[styles.workersLabel, { color: theme.textColor }]}>
            Workers
          </Text>
          <TextInput
            style={[
              styles.workersInput,
              { borderColor: theme.borderColor, color: theme.textColor },
            ]}
            value={workersInput}
            onChangeText={(v) => {
              setWorkersInput(v);
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 1 && n <= 16) setWorkers(n);
            }}
            onBlur={() => {
              // Restore valid value if field was left empty or out of range
              const n = parseInt(workersInput, 10);
              const clamped = isNaN(n) ? workers : Math.min(16, Math.max(1, n));
              setWorkers(clamped);
              setWorkersInput(String(clamped));
            }}
            keyboardType="number-pad"
            editable={!running}
            selectTextOnFocus
          />
        </View>

        {/* Progress */}
        {running && currentLabel != null && (
          <View style={styles.progress}>
            <ActivityIndicator size="small" color={theme.primaryColor} />
            <Text style={[styles.progressText, { color: theme.textColor }]}>
              Running {currentLabel}…
            </Text>
          </View>
        )}

        {/* Results */}
        {results.length === 0 && !running ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: theme.textColor }]}>
              Press Run to start benchmark
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
          >
            {results.map((r) => (
              <ResultCard key={r.label} result={r} theme={theme} />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function ResultCard({
  result,
  theme,
}: {
  result: BenchmarkResult;
  theme: AltchaTheme;
}) {
  const hasError = result.error != null;
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme.borderColor,
          backgroundColor: theme.backgroundColor,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.textColor }]}>
        {result.label}
      </Text>
      <View style={styles.cardFields}>
        <Field label="Algorithm" value={result.algorithm} theme={theme} />
        <Field label="Cost" value={String(result.cost)} theme={theme} />
        {result.memoryCost != null && (
          <Field
            label="Mem cost"
            value={String(result.memoryCost)}
            theme={theme}
          />
        )}
        {hasError ? (
          <Field
            label="Error"
            value={result.error!}
            theme={theme}
            valueColor={theme.errorColor}
          />
        ) : (
          <>
            <Field
              label="Counter"
              value={result.counter != null ? String(result.counter) : '—'}
              theme={theme}
            />
            <Field
              label="Time"
              value={`${result.timeMs} ms`}
              theme={theme}
              valueColor={theme.primaryColor}
              bold
            />
          </>
        )}
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  theme,
  valueColor,
  bold = false,
}: {
  label: string;
  value: string;
  theme: AltchaTheme;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textColor }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.fieldValue,
          { color: valueColor ?? theme.textColor },
          bold && styles.fieldValueBold,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    minWidth: 60,
  },
  backText: {
    fontSize: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  runButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  runButtonDisabled: {
    opacity: 0.5,
  },
  runButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  workersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  workersLabel: {
    fontSize: 13,
  },
  workersInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    width: 56,
    textAlign: 'center',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  progressText: {
    fontSize: 13,
    opacity: 0.7,
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    opacity: 0.5,
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    gap: 8,
    paddingBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardFields: {
    gap: 4,
  },
  field: {
    flexDirection: 'row',
  },
  fieldLabel: {
    width: 80,
    fontSize: 12,
    opacity: 0.6,
  },
  fieldValue: {
    flex: 1,
    fontSize: 12,
  },
  fieldValueBold: {
    fontWeight: '700',
  },
});
