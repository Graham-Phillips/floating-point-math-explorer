#include <stdio.h>
#include <string.h>
#define DECNUMDIGITS 128
#include "decNumber.h"
#include "decContext.h"

static char result_buffer[4096];
static char quantum_buffer[64];

typedef struct {
  decNumber number;
  decNumberUnit extra_units[64];
} DecNumberStorage;

static int bridge_precision(int precision) {
  if (precision < 1) {
    return 34;
  }
  if (precision > DECNUMDIGITS) {
    return DECNUMDIGITS;
  }
  return precision;
}

static const char *finish(decNumber *result) {
  decNumberToString(result, result_buffer);
  return result_buffer;
}

static void bridge_context(decContext *context, int precision) {
  decContextDefault(context, DEC_INIT_BASE);
  context->digits = bridge_precision(precision);
  context->traps = 0;
}

static enum rounding bridge_rounding(const char *mode) {
  if (strcmp(mode, "up") == 0) {
    return DEC_ROUND_UP;
  }
  if (strcmp(mode, "down") == 0) {
    return DEC_ROUND_DOWN;
  }
  if (strcmp(mode, "ceil") == 0) {
    return DEC_ROUND_CEILING;
  }
  if (strcmp(mode, "floor") == 0) {
    return DEC_ROUND_FLOOR;
  }
  if (strcmp(mode, "half-up") == 0) {
    return DEC_ROUND_HALF_UP;
  }
  if (strcmp(mode, "half-down") == 0) {
    return DEC_ROUND_HALF_DOWN;
  }

  return DEC_ROUND_HALF_EVEN;
}

const char *decnumber_add(const char *left, const char *right, int precision) {
  decContext context;
  DecNumberStorage a;
  DecNumberStorage b;
  DecNumberStorage result;
  bridge_context(&context, precision);
  decNumberFromString(&a.number, left, &context);
  decNumberFromString(&b.number, right, &context);
  decNumberAdd(&result.number, &a.number, &b.number, &context);
  return finish(&result.number);
}

const char *decnumber_subtract(const char *left, const char *right, int precision) {
  decContext context;
  DecNumberStorage a;
  DecNumberStorage b;
  DecNumberStorage result;
  bridge_context(&context, precision);
  decNumberFromString(&a.number, left, &context);
  decNumberFromString(&b.number, right, &context);
  decNumberSubtract(&result.number, &a.number, &b.number, &context);
  return finish(&result.number);
}

const char *decnumber_multiply(const char *left, const char *right, int precision) {
  decContext context;
  DecNumberStorage a;
  DecNumberStorage b;
  DecNumberStorage result;
  bridge_context(&context, precision);
  decNumberFromString(&a.number, left, &context);
  decNumberFromString(&b.number, right, &context);
  decNumberMultiply(&result.number, &a.number, &b.number, &context);
  return finish(&result.number);
}

const char *decnumber_divide(const char *left, const char *right, int precision) {
  decContext context;
  DecNumberStorage a;
  DecNumberStorage b;
  DecNumberStorage result;
  bridge_context(&context, precision);
  decNumberFromString(&a.number, left, &context);
  decNumberFromString(&b.number, right, &context);
  decNumberDivide(&result.number, &a.number, &b.number, &context);
  return finish(&result.number);
}

const char *decnumber_round(const char *value, int decimals, const char *mode, int precision) {
  decContext context;
  DecNumberStorage number;
  DecNumberStorage quantum;
  DecNumberStorage result;
  bridge_context(&context, precision);
  context.round = bridge_rounding(mode);

  if (decimals < 0) {
    decimals = 0;
  }

  snprintf(quantum_buffer, sizeof(quantum_buffer), "1E-%d", decimals);
  decNumberFromString(&number.number, value, &context);
  decNumberFromString(&quantum.number, quantum_buffer, &context);
  decNumberQuantize(&result.number, &number.number, &quantum.number, &context);
  return finish(&result.number);
}
