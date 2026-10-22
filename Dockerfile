FROM ruby:3.3.12-slim AS builder

# Build tools for gems with native extensions (eventmachine, http_parser.rb)
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /srv/jekyll

# Install the exact gem versions from the committed lockfile
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy the site (see .dockerignore) and build it
COPY . .
RUN JEKYLL_ENV=production bundle exec jekyll build

FROM nginx:1.30.5-alpine
COPY --from=builder /srv/jekyll/_site /usr/share/nginx/html
