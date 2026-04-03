package pipeline

import (
	"fmt"
	"math"
	"regexp"
	"strings"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/vm"
)

// ExprEnv is the expression evaluation environment.
type ExprEnv struct {
	Item  any            `json:"item"`
	Index int            `json:"index"`
	Args  map[string]any `json:"args"`
	Vars  map[string]any `json:"vars"`
}

// toFloat converts any numeric type to float64.
func toFloat(v any) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case int32:
		return float64(val)
	case int16:
		return float64(val)
	case int8:
		return float64(val)
	case uint:
		return float64(val)
	case uint64:
		return float64(val)
	case uint32:
		return float64(val)
	case uint16:
		return float64(val)
	case uint8:
		return float64(val)
	default:
		return 0
	}
}

// MathFuncs exposes math functions callable from expressions.
// Each function accepts any numeric types and converts internally.
var MathFuncs = map[string]any{
	"min":   func(a, b any) float64 { return math.Min(toFloat(a), toFloat(b)) },
	"max":   func(a, b any) float64 { return math.Max(toFloat(a), toFloat(b)) },
	"abs":   func(a any) float64 { return math.Abs(toFloat(a)) },
	"ceil":  func(a any) float64 { return math.Ceil(toFloat(a)) },
	"floor": func(a any) float64 { return math.Floor(toFloat(a)) },
	"round": func(a any) float64 { return math.Round(toFloat(a)) },
}

var templateRe = regexp.MustCompile(`\$\{\{(.+?)\}\}`)

// exprEnv builds the expr environment map.
func exprEnv(env ExprEnv) map[string]any {
	return map[string]any{
		"item":  env.Item,
		"index": env.Index,
		"args":  env.Args,
		"vars":  env.Vars,
		"Math":  MathFuncs,
	}
}

// compileExpr compiles an expression for repeated execution.
func compileExpr(input string) (*vm.Program, error) {
	exprStr := input
	if strings.HasPrefix(input, "${{") && strings.HasSuffix(input, "}}") {
		exprStr = strings.TrimSpace(input[3 : len(input)-2])
	}

	// Use placeholder values at compile time so field access works
	fullEnv := map[string]any{
		"item":  make(map[string]any),
		"index": 0,
		"args":  make(map[string]any),
		"vars":  make(map[string]any),
		"Math":  MathFuncs,
	}
	program, err := expr.Compile(exprStr, expr.Env(fullEnv), expr.AllowUndefinedVariables())
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "unknown name") {
			errMsg += " (known: item, index, args, vars, Math)"
		}
		return nil, fmt.Errorf("compile expr %q: %s", input, errMsg)
	}
	return program, nil
}

// runExpr runs a pre-compiled program with the given environment.
func runExpr(program *vm.Program, env ExprEnv) (any, error) {
	fullEnv := exprEnv(env)
	result, err := expr.Run(program, fullEnv)
	if err != nil {
		return nil, fmt.Errorf("eval expr: %w", err)
	}
	return result, nil
}

// Resolve evaluates a ${{ }} expression and returns the result.
// If the input contains no template markers, it is returned as-is.
// If the entire input is a single ${{ }} expression, the raw typed result is returned.
// Otherwise, string interpolation is performed and a string is returned.
// Resolution fails fast on the first expression error.
func Resolve(input string, env ExprEnv) (any, error) {
	if !strings.Contains(input, "${{") {
		return input, nil
	}

	// If the entire input is a single ${{ }} expression, return the raw result
	matches := templateRe.FindAllStringSubmatch(input, -1)
	if len(matches) == 1 && input == matches[0][0] {
		return evalExpr(strings.TrimSpace(matches[0][1]), env)
	}

	// Otherwise, do string replacement (fail fast on first error)
	var lastErr error
	result := templateRe.ReplaceAllStringFunc(input, func(match string) string {
		if lastErr != nil {
			return match // skip remaining after error
		}
		exprStr := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(match, "${{"), "}}"))
		val, err := evalExpr(exprStr, env)
		if err != nil {
			lastErr = err
			return match
		}
		return fmt.Sprintf("%v", val)
	})

	if lastErr != nil {
		return nil, lastErr
	}

	return result, nil
}

func evalExpr(expression string, env ExprEnv) (any, error) {
	fullEnv := exprEnv(env)

	program, err := expr.Compile(expression, expr.Env(fullEnv))
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "unknown name") {
			errMsg += " (known: item, index, args, vars, Math)"
		}
		return nil, fmt.Errorf("compile expr %q: %s", expression, errMsg)
	}

	result, err := expr.Run(program, fullEnv)
	if err != nil {
		return nil, fmt.Errorf("eval expr %q: %w", expression, err)
	}

	return result, nil
}
