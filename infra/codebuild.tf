resource "aws_codebuild_project" "mercato" {
  name          = "${var.app_name}-mercato"
  description   = "Test, build, and deploy Giftory Mercato backend"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  source {
    type      = "GITHUB"
    location  = "https://github.com/oxohive/giftory"
    buildspec = "buildspec.yml"

    git_clone_depth = 1
    report_build_status = true
  }

  source_version = "main"

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    type         = "LINUX_CONTAINER"
    image        = "aws/codebuild/standard:7.0"
    compute_type = "BUILD_GENERAL1_LARGE"

    # Needed to run `docker build` inside CodeBuild
    privileged_mode = true
  }

  logs_config {
    cloudwatch_logs {
      status     = "ENABLED"
      group_name = "/aws/codebuild/${var.app_name}-mercato"
    }
  }

  cache {
    type  = "LOCAL"
    modes = ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_SOURCE_CACHE"]
  }

  tags = local.common_tags
}

resource "aws_codebuild_source_credential" "github" {
  auth_type   = "PERSONAL_ACCESS_TOKEN"
  server_type = "GITHUB"
  token       = var.github_pat
}

resource "aws_codebuild_webhook" "mercato" {
  project_name = aws_codebuild_project.mercato.name

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }
    filter {
      type    = "HEAD_REF"
      pattern = "^refs/heads/main$"
    }
    # Only build when app code changes — skip docs/spec/infra/buildspec-only pushes.
    filter {
      type    = "FILE_PATH"
      pattern = "^apps/"
    }
  }

  depends_on = [aws_codebuild_source_credential.github]
}
