#!/bin/bash
# Convert model to WebLLM format using MLC-LLM
# This needs to be run with MLC-LLM installed

MODEL_PATH="./merged_model"
OUTPUT_PATH="./webllm_model"

echo "Converting model to WebLLM format..."
echo "Note: This requires MLC-LLM. Install with:"
echo "pip install mlc-llm mlc-ai-nightly"

# Convert to MLC format
python -m mlc_llm convert \
    --model $MODEL_PATH \
    --quantization q4f16_1 \
    --target webgpu \
    --output $OUTPUT_PATH \
    --context-window 2048

echo "Model converted to: $OUTPUT_PATH"
echo "Copy the output to your Chrome extension's models/ directory"
