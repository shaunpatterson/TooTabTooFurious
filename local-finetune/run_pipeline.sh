#!/bin/bash

# Complete Fine-tuning Pipeline for Tab Categorization
# This script runs the entire pipeline from dataset generation to deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MODEL_NAME="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
NUM_SAMPLES=10000
EPOCHS=3
QUANTIZATION="int8"  # or "4bit"
OUTPUT_DIR="output"
DATA_DIR="data"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Tab Categorization Fine-tuning Pipeline${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Python
if ! command_exists python3; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 0: Setup Environment${NC}"
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo -e "${GREEN}✓ Environment ready${NC}"
echo ""

# Step 1: Generate Dataset
echo -e "${YELLOW}Step 1: Generate Training Dataset${NC}"
echo "Generating $NUM_SAMPLES samples..."

python dataset_generator.py \
    --samples $NUM_SAMPLES \
    --output $DATA_DIR \
    --add-hard

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dataset generated successfully${NC}"
else
    echo -e "${RED}✗ Dataset generation failed${NC}"
    exit 1
fi
echo ""

# Step 2: Fine-tune Model
echo -e "${YELLOW}Step 2: Fine-tune Model with LoRA${NC}"
echo "Fine-tuning $MODEL_NAME for $EPOCHS epochs..."

python finetune_lora.py \
    --model $MODEL_NAME \
    --train-data $DATA_DIR/train.jsonl \
    --val-data $DATA_DIR/val.jsonl \
    --output $OUTPUT_DIR \
    --epochs $EPOCHS \
    --lora-r 16 \
    --lora-alpha 32 \
    --use-4bit \
    --merge \
    --test

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Model fine-tuned successfully${NC}"
else
    echo -e "${RED}✗ Fine-tuning failed${NC}"
    exit 1
fi
echo ""

# Step 3: Convert to WebLLM Format
echo -e "${YELLOW}Step 3: Convert Model to WebLLM Format${NC}"
echo "Converting model with $QUANTIZATION quantization..."

python convert_to_webllm.py \
    --model $OUTPUT_DIR/merged_model \
    --output $OUTPUT_DIR/webllm_model \
    --quantize $QUANTIZATION

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Model converted successfully${NC}"
else
    echo -e "${RED}✗ Model conversion failed${NC}"
    exit 1
fi
echo ""

# Step 4: Evaluate Model
echo -e "${YELLOW}Step 4: Evaluate Model Performance${NC}"
echo "Running evaluation..."

python evaluate.py \
    --model $OUTPUT_DIR/merged_model \
    --test-data $DATA_DIR/val.jsonl \
    --output $OUTPUT_DIR/evaluation \
    --plot \
    --benchmark

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Evaluation complete${NC}"
else
    echo -e "${RED}✗ Evaluation failed${NC}"
    exit 1
fi
echo ""

# Step 5: Deploy to Extension
echo -e "${YELLOW}Step 5: Deploy Model to Chrome Extension${NC}"
echo "Deploying to extension..."

python deploy.py \
    --model $OUTPUT_DIR/webllm_model \
    --extension ..

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Model deployed successfully${NC}"
else
    echo -e "${RED}✗ Deployment failed${NC}"
    exit 1
fi
echo ""

# Summary
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Pipeline Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo "Summary:"
echo "  - Dataset: $NUM_SAMPLES samples generated"
echo "  - Model: Fine-tuned for $EPOCHS epochs"
echo "  - Format: Converted to WebLLM with $QUANTIZATION quantization"
echo "  - Deployment: Model deployed to Chrome extension"
echo ""
echo "Next steps:"
echo "  1. Reload the Chrome extension (chrome://extensions)"
echo "  2. Test tab categorization with the new model"
echo "  3. Check evaluation results in $OUTPUT_DIR/evaluation/"
echo ""
echo -e "${GREEN}The fine-tuned model is now ready for use!${NC}"