FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

COPY pom.xml .
COPY src ./src
RUN mvn -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/target/carbon-energy-platform-app.jar ./app.jar
COPY viewweb ./viewweb

EXPOSE 3000
CMD ["java", "-jar", "app.jar"]
