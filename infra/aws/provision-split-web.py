"""Provision the web host in the existing production VPC. Run from AWS CloudShell."""
import json
import os
import boto3
from botocore.exceptions import ClientError

region = os.environ.get('AWS_REGION', 'us-east-1')
account = boto3.client('sts').get_caller_identity()['Account']
bucket = os.environ['ARTIFACT_BUCKET']
queue_arn = os.environ['RESEARCH_QUEUE_ARN']
database_secret = os.environ['DATABASE_SECRET_ARN']
vpc = os.environ['VPC_ID']
worker_sg = os.environ['WORKER_SECURITY_GROUP_ID']
database_sg = os.environ['DATABASE_SECURITY_GROUP_ID']
subnet = os.environ['WEB_SUBNET_ID']
ec2 = boto3.client('ec2', region_name=region)
iam = boto3.client('iam')
role = 'stocksembly-web-runtime'
trust = {'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'ec2.amazonaws.com'},'Action':'sts:AssumeRole'}]}
try:
    iam.create_role(RoleName=role, AssumeRolePolicyDocument=json.dumps(trust))
except iam.exceptions.EntityAlreadyExistsException:
    pass
policy = {'Version':'2012-10-17','Statement':[
    {'Effect':'Allow','Action':['s3:GetObject'],'Resource':f'arn:aws:s3:::{bucket}/artifacts/*'},
    {'Effect':'Allow','Action':['sqs:SendMessage','sqs:GetQueueAttributes','sqs:GetQueueUrl'],'Resource':queue_arn},
    {'Effect':'Allow','Action':['secretsmanager:DescribeSecret','secretsmanager:GetSecretValue'],'Resource':database_secret},
    {'Effect':'Allow','Action':['ecr:GetAuthorizationToken'],'Resource':'*'},
    {'Effect':'Allow','Action':['ecr:BatchCheckLayerAvailability','ecr:GetDownloadUrlForLayer','ecr:BatchGetImage'],'Resource':f'arn:aws:ecr:{region}:{account}:repository/stocksembly'}
]}
iam.put_role_policy(RoleName=role,PolicyName='web-runtime',PolicyDocument=json.dumps(policy))
iam.attach_role_policy(RoleName=role,PolicyArn='arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore')
try:
    iam.create_instance_profile(InstanceProfileName=role)
except iam.exceptions.EntityAlreadyExistsException:
    pass
if not iam.get_instance_profile(InstanceProfileName=role)['InstanceProfile']['Roles']:
    iam.add_role_to_instance_profile(InstanceProfileName=role,RoleName=role)
groups=ec2.describe_security_groups(Filters=[{'Name':'group-name','Values':['stocksembly-web']},{'Name':'vpc-id','Values':[vpc]}])['SecurityGroups']
sg=groups[0]['GroupId'] if groups else ec2.create_security_group(GroupName='stocksembly-web',Description='Stocksembly web; public HTTPS, SSH only from existing worker',VpcId=vpc)['GroupId']
def ingress(group, permission):
    try:
        ec2.authorize_security_group_ingress(GroupId=group,IpPermissions=[permission])
    except ClientError as error:
        if error.response['Error']['Code'] != 'InvalidPermission.Duplicate':
            raise
for port in [80,443]:
    ingress(sg,{'IpProtocol':'tcp','FromPort':port,'ToPort':port,'IpRanges':[{'CidrIp':'0.0.0.0/0'}]})
ingress(sg,{'IpProtocol':'tcp','FromPort':22,'ToPort':22,'UserIdGroupPairs':[{'GroupId':worker_sg}]})
ingress(database_sg,{'IpProtocol':'tcp','FromPort':5432,'ToPort':5432,'UserIdGroupPairs':[{'GroupId':sg}]})
user_data='''#!/bin/bash
set -euo pipefail
dnf install -y docker nginx
systemctl enable --now docker amazon-ssm-agent
install -d -m 0700 /etc/stocksembly /opt/stocksembly/container
install -d -m 0700 -o ec2-user -g ec2-user /var/lib/stocksembly/research
'''
instances=ec2.describe_instances(Filters=[{'Name':'tag:Name','Values':['stocksembly-web']},{'Name':'instance-state-name','Values':['pending','running','stopping','stopped']}])['Reservations']
if instances:
    instance=instances[0]['Instances'][0]
else:
    instance=ec2.run_instances(ImageId='ami-0006118602dfc1c09',InstanceType='t3.medium',MinCount=1,MaxCount=1,KeyName='stocksembly-web-worker-20260913',IamInstanceProfile={'Name':role},NetworkInterfaces=[{'DeviceIndex':0,'SubnetId':subnet,'Groups':[sg],'AssociatePublicIpAddress':True}],MetadataOptions={'HttpTokens':'required','HttpPutResponseHopLimit':2},BlockDeviceMappings=[{'DeviceName':'/dev/xvda','Ebs':{'VolumeSize':40,'VolumeType':'gp3','Encrypted':True,'DeleteOnTermination':True}}],UserData=user_data,ClientToken='stocksembly-split-web-20260913',TagSpecifications=[{'ResourceType':'instance','Tags':[{'Key':'Name','Value':'stocksembly-web'},{'Key':'Application','Value':'Stocksembly'},{'Key':'Role','Value':'web'}]}])['Instances'][0]
print(json.dumps({'instanceId':instance['InstanceId'],'privateIp':instance.get('PrivateIpAddress'),'publicIp':instance.get('PublicIpAddress'),'securityGroup':sg}))

# Preserve existing deployment permissions and add only this web target.
deploy_role = "stocksembly-github-deploy"
deploy_policy = "stocksembly-build-and-deploy"
document = iam.get_role_policy(RoleName=deploy_role, PolicyName=deploy_policy)["PolicyDocument"]
for statement in document["Statement"]:
    if "ssm:SendCommand" in statement["Action"]:
        resource = f"arn:aws:ec2:{region}:{account}:instance/{instance['InstanceId']}"
        if resource not in statement["Resource"]:
            statement["Resource"].append(resource)
    if "ecr:PutImage" in statement["Action"] and "ecr:DescribeImages" not in statement["Action"]:
        statement["Action"].append("ecr:DescribeImages")
iam.put_role_policy(RoleName=deploy_role, PolicyName=deploy_policy, PolicyDocument=json.dumps(document))
