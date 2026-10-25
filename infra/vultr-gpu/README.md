# Vultr GPU worker

This Terraform stack creates one disposable Vultr Cloud GPU worker for
P.R.V.S.A. It builds the repository's FastAPI Docker image and starts private
[Hugging Face Text Embeddings Inference (TEI)](https://huggingface.co/docs/text-embeddings-inference/index)
services. The default models are `Qwen/Qwen3-Embedding-0.6B` for embeddings and
`SamLowe/roberta-base-go_emotions` for lightweight text classification.

TEI dynamically batches concurrent requests on the GPU. FastAPI remains a
lightweight CPU process and calls the model containers over a private Docker
network. Price, shopping, and YouTube collection can continue in parallel while
the GPU handles embeddings or classifications.

## Security and lifecycle

- FastAPI and both TEI ports bind to `127.0.0.1` on the worker. They are not
  public.
- The Vultr firewall permits only SSH, from the IPv4 CIDRs you supply.
- Terraform installs existing Vultr SSH keys and creates a limited `linuxuser`
  account instead of enabling password-based application access.
- Model weights remain in a Docker volume on this disposable instance. They
  disappear when Terraform destroys the instance.
- Application API keys are entered interactively on the VM after provisioning.
  They are not stored in Terraform state or cloud-init user data.
- A stopped Vultr instance can still incur charges. Run `terraform destroy`
  when the GPU is no longer needed.

## 1. Find a GPU plan

Install [Terraform](https://developer.hashicorp.com/terraform/install) and the
[Vultr CLI](https://github.com/vultr/vultr-cli), then inspect live capacity:

```bash
vultr-cli regions list
vultr-cli regions availability ewr
vultr-cli plans list
vultr-cli ssh-key list
```

GPU availability varies by region. The stack checks that the selected plan
reports GPU VRAM, is offered in the selected region, and stays under the
configured monthly-price ceiling.

The default TEI image is the generic CUDA image. Consult the
[current TEI hardware table](https://huggingface.co/docs/text-embeddings-inference/en/supported_models)
and override `embedding_image` with the architecture-specific image for the
selected Vultr GPU when needed.

### Model profiles

| Purpose | Model | Approximate size | When to choose it |
| --- | --- | ---: | --- |
| Fast English embeddings | `sentence-transformers/all-mpnet-base-v2` | 109M | Lowest memory and quick experiments |
| Balanced embeddings (default) | `Qwen/Qwen3-Embedding-0.6B` | 509M | Strong retrieval quality without a large model |
| Multilingual embeddings | `intfloat/multilingual-e5-large-instruct` | 560M | Reviews in several languages |
| Higher-quality embeddings | `Qwen/Qwen3-Embedding-4B` | 4.02B | Larger GPU and quality-first retrieval |
| Emotion classification (default) | `SamLowe/roberta-base-go_emotions` | Base-size | A lightweight local signal for review tone |

The classifier returns model labels and confidence scores. It does not replace
Gemini's structured summaries, aspect extraction, or evidence verification.
Disable it with `deploy_classification_model = false` on a very small GPU.

## 2. Configure credentials and variables

Create a Vultr API key, restrict its source IP in the Vultr customer portal,
and pass it to Terraform through the environment—not through a committed file:

```bash
export TF_VAR_vultr_api_key="your-vultr-api-key"
```

Create local configuration:

```bash
cd infra/vultr-gpu
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with an available region, GPU plan, existing SSH key
ID, your current public IPv4 address as a `/32`, and a Git branch or tag that
contains these deployment files. The local file is ignored by Git. The worker
clones the public repository and builds its Dockerfile, so push the selected
ref before applying Terraform.

## 3. Provision the worker

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=worker.tfplan
terraform apply worker.tfplan
```

Provisioning the VM is faster than downloading the container and model. After
Terraform finishes, use the `ssh_command` output and wait for cloud-init:

```bash
ssh linuxuser@WORKER_IP
sudo cloud-init status --wait
sudo prvsa-gpu-status
```

If `nvidia-smi` fails, verify that `os_id` is a current Vultr GPU-enabled Ubuntu
image before retrying. The stack deliberately fails bootstrap instead of
silently running embeddings on the CPU.

Configure the existing research-provider credentials through a masked
interactive prompt. This keeps them out of Terraform state:

```bash
sudo prvsa-configure-api
```

To deploy a newer commit from the configured Git ref later:

```bash
sudo prvsa-deploy
```

## 4. Connect FastAPI and use the models

On your computer, run Terraform's `api_tunnel_command` output and leave it
running. It forwards the remote FastAPI port to the same
`http://127.0.0.1:8000` address already used by the Chrome extension. In a
second terminal:

```bash
curl http://127.0.0.1:8000/healthz
curl http://127.0.0.1:8000/api/models/health

curl http://127.0.0.1:8000/api/embeddings \
  -H 'Content-Type: application/json' \
  -d '{"inputs":["excellent battery life","battery drains quickly"]}'

curl http://127.0.0.1:8000/api/classify \
  -H 'Content-Type: application/json' \
  -d '{"inputs":["excellent battery life","battery drains quickly"]}'
```

The API can submit several independent batches concurrently. TEI combines work
where possible instead of starting a separate model for each P.R.V.S.A. route:

```python
import asyncio

import httpx


async def embed(batch: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        response = await client.post(
            "/api/embeddings", json={"inputs": batch}, timeout=90
        )
        response.raise_for_status()
        return response.json()["vectors"]


async def main() -> None:
    review_vectors, transcript_vectors, product_vectors = await asyncio.gather(
        embed(["review one", "review two"]),
        embed(["transcript segment one", "transcript segment two"]),
        embed(["product title and description"]),
    )
    print(len(review_vectors), len(transcript_vectors), len(product_vectors))


asyncio.run(main())
```

These vectors can power semantic review search, clustering, duplicate-review
detection, or retrieval before a smaller sentiment model. Embeddings do not
replace the live product/review collection step; they process whichever text a
new request has just collected.

The normal product routes use both private model services automatically:

- `/api/prices` embedding-ranks offers before Gemini compares their value.
- `/api/shopping` embedding-ranks and deduplicates review excerpts, then runs
  local classification before Gemini produces the final evidence-backed result.
- `/api/youtube` chunks transcripts, selects relevant passages with embeddings,
  and classifies them before Gemini produces each final review analysis.

GPU preparation is best-effort. If either local model is temporarily
unavailable, the routes retain their previous behavior and continue with the
original source ordering. Successful responses include `localModel` diagnostic
metadata, while the extension continues to consume the existing analysis
schema.

## 5. Destroy it when finished

```bash
terraform destroy
```

Review the displayed instance and firewall resources, then approve the destroy.
Terraform state can contain infrastructure identifiers, so keep it local or use
an encrypted remote backend if the team starts sharing this stack.
