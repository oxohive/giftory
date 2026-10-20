# ─── ACM Certificate (backend API subdomain) ─────────────────────────────────

resource "aws_acm_certificate" "mercato" {
  domain_name       = "${var.api_subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.common_tags
}

# ─── Porkbun DNS ──────────────────────────────────────────────────────────────

# ACM DNS validation record for the API cert
resource "porkbun_dns_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.mercato.domain_validation_options : dvo.domain_name => dvo
  }

  domain  = var.domain_name
  type    = each.value.resource_record_type
  name    = trimsuffix(each.value.resource_record_name, ".${var.domain_name}.")
  content = trimsuffix(each.value.resource_record_value, ".")
  ttl     = "600"
}

# CAA record allowing Amazon ACM to issue certificates for oxohive.com (root)
resource "porkbun_dns_record" "caa_amazon" {
  domain  = var.domain_name
  type    = "CAA"
  name    = ""
  content = "0 issue \"amazon.com\""
  ttl     = "600"
}

# CNAME: admin.giftory.dev.oxohive.com → ALB
resource "porkbun_dns_record" "api" {
  domain  = var.domain_name
  type    = "CNAME"
  name    = var.api_subdomain
  content = aws_lb.main.dns_name
  ttl     = "600"
}

# CNAME: giftory.dev.oxohive.com → Vercel
resource "porkbun_dns_record" "storefront" {
  domain  = var.domain_name
  type    = "CNAME"
  name    = var.subdomain
  content = "cname.vercel-dns.com"
  ttl     = "600"
}

# TXT: Vercel domain ownership verification
resource "porkbun_dns_record" "storefront_verify" {
  domain  = var.domain_name
  type    = "TXT"
  name    = "_vercel"
  content = "vc-domain-verify=giftory.dev.oxohive.com,9f457768ae5f0ba333b7"
  ttl     = "600"
}

# CNAME: dealer.giftory.dev.oxohive.com → Vercel
resource "porkbun_dns_record" "dealer_portal" {
  domain  = var.domain_name
  type    = "CNAME"
  name    = var.dealer_subdomain
  content = "cname.vercel-dns.com"
  ttl     = "600"
}

# TXT: Vercel domain ownership verification for the dealer portal.
# NOT YET APPLIED — the verification code is issued by Vercel when
# vercel_project_domain.dealer_portal is first created; it cannot be known
# ahead of that (storefront's own TXT record above was added the same way,
# after its domain's first apply). Read it from `tofu apply`'s output or the
# Vercel dashboard (Project → Settings → Domains) and fill it in here, mirroring
# the storefront_verify record above, before the domain will actually resolve.

# ─── ACM Validation wait ──────────────────────────────────────────────────────

resource "aws_acm_certificate_validation" "mercato" {
  certificate_arn         = aws_acm_certificate.mercato.arn
  validation_record_fqdns = [for r in porkbun_dns_record.acm_validation : "${r.name}.${var.domain_name}"]
}
